#!/usr/bin/env node
// One-shot Todoist → Taskwarrior conversion. Reads a v1 sync API dump and
// writes a JSON file ready for `task import`. Not part of the app build.
//
// Usage:
//   node migrate-todoist.js [dump.json] [out.json]
//
// Mapping rules:
//   - Todoist project tree → Taskwarrior dot-projects (kebab-case).
//     Inbox tasks get no project (matches the GTD "Inbox = sin proyecto" rule).
//   - Sections → an extra dot segment under the project.
//   - Priorities Todoist 4/3/2/1 → Taskwarrior H/M/L/(none).
//   - Labels → tags (slugified).
//   - Recurring tasks → status:recurring with recur: <period> when parseable;
//     unparseable strings keep due: + tag:+recurring with the original string
//     in an annotation.
//   - Subtasks → +subtask tag; the parent depends on its children so the
//     parent stays blocked until all children close.

const fs = require('fs');
const crypto = require('crypto');

const DUMP = process.argv[2] || 'todoist-dump.json';
const OUT  = process.argv[3] || 'family-import.json';

const dump = JSON.parse(fs.readFileSync(DUMP, 'utf8'));

const slug = (s) => (s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/['’]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-+|-+$)/g, '');

const projectsById = new Map(dump.projects.map(p => [p.id, p]));
const sectionsById = new Map(dump.sections.map(s => [s.id, s]));

function projectPath(projectId) {
  const parts = [];
  let pid = projectId;
  const seen = new Set();
  while (pid && !seen.has(pid)) {
    seen.add(pid);
    const p = projectsById.get(pid);
    if (!p) break;
    parts.unshift(slug(p.name));
    pid = p.parent_id;
  }
  return parts;
}

function buildProjectField(item) {
  const proj = projectsById.get(item.project_id);
  if (!proj) return undefined;
  if (proj.name === 'Inbox' && !proj.parent_id) return undefined;

  const parts = projectPath(item.project_id).filter(Boolean);
  if (item.section_id) {
    const section = sectionsById.get(item.section_id);
    if (section && !section.is_archived) {
      const s = slug(section.name);
      if (s) parts.push(s);
    }
  }
  return parts.length ? parts.join('.') : undefined;
}

const PRIORITY_MAP = { 4: 'H', 3: 'M', 2: 'L', 1: undefined };

function isoBasic(input) {
  if (!input) return undefined;
  const date = (typeof input === 'string' && input.length === 10)
    ? `${input}T00:00:00Z`
    : input;
  const d = new Date(date);
  if (isNaN(d.getTime())) return undefined;
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

const NOW = isoBasic(new Date().toISOString());

// Parse Todoist due-strings into a Taskwarrior `recur` period.
// Handles English ("ev"/"every") and Spanish ("cada") prefixes plus
// the "day month" shorthand Todoist uses for yearly events
// ("ev 25 Apr", "cada 1 nov", "every 29th Nov" → yearly).
const MONTHS = /^(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december|ene|enero|febr?|febrero|marzo|abr|abril|mayo|junio|julio|ago|agosto|sept?|septiembre|octubre|nov|noviembre|dic|diciembre)$/;
const WEEKDAYS = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|lun|mar|mie|jue|vie|sab|dom|lunes|martes|miercoles|jueves|viernes|sabado|domingo)$/;

function parseRecur(str) {
  if (!str) return undefined;
  const s = str.toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/^(every|ev|cada)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return undefined;

  if (WEEKDAYS.test(s)) return 'weekly';
  if (/^(weekday|weekend)$/.test(s)) return 'weekly';

  if (/^(day|dia|daily)s?$/.test(s)) return 'daily';
  if (/^(week|semana|weekly)s?$/.test(s)) return 'weekly';
  if (/^(month|mes|monthly)e?s?$/.test(s)) return 'monthly';
  if (/^(year|ano|yearly|anual)s?$/.test(s)) return 'yearly';

  // "N units"
  const m = /^(\d+)\s+(day|dia|week|semana|month|mes|year|ano)s?$/.exec(s);
  if (m) {
    const n = parseInt(m[1], 10);
    const u = m[2];
    const norm = (
      /^(day|dia)$/.test(u) ? 'day' :
      /^(week|semana)$/.test(u) ? 'week' :
      /^(month|mes)$/.test(u) ? 'month' :
      'year'
    );
    if (n === 1) return { day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' }[norm];
    return `${n}${norm}s`;
  }

  // "<day> <month>" / "<month> <day>" / "<Nth> <month>" → yearly
  const tokens = s.replace(/(\d+)(st|nd|rd|th)/g, '$1').split(' ');
  if (tokens.length === 2) {
    const [a, b] = tokens;
    const aIsDay = /^\d{1,2}$/.test(a);
    const bIsDay = /^\d{1,2}$/.test(b);
    if ((aIsDay && MONTHS.test(b)) || (bIsDay && MONTHS.test(a))) return 'yearly';
  }
  return undefined;
}

const items = dump.items.filter(i => !i.checked && !i.is_deleted);

// Deterministic UUID v5 from the Todoist item id: re-running this script
// against the same (or updated) dump reuses the same UUIDs, so `task import`
// modifies the existing tasks instead of creating parallel duplicates. The
// namespace is fixed for this script — never change it or every prior import
// becomes unreachable.
const TODOIST_NS = Buffer.from('6ba7b811-9dad-11d1-80b4-00c04fd430c8'.replace(/-/g, ''), 'hex');
function uuidV5(name) {
  const hash = crypto.createHash('sha1').update(TODOIST_NS).update(Buffer.from(name, 'utf8')).digest().slice(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}
const uuidByItemId = new Map();
items.forEach(i => uuidByItemId.set(i.id, uuidV5(`todoist:${i.id}`)));

// Build child→parent map for the depends idiom (parent depends on children).
const childrenByParent = new Map();
for (const item of items) {
  if (item.parent_id && uuidByItemId.has(item.parent_id)) {
    if (!childrenByParent.has(item.parent_id)) childrenByParent.set(item.parent_id, []);
    childrenByParent.get(item.parent_id).push(item.id);
  }
}

const tasks = [];
const stats = { recurMapped: 0, recurUnmapped: 0, byProject: {}, total: 0 };

for (const item of items) {
  const uuid = uuidByItemId.get(item.id);
  const tags = (item.labels || []).map(slug).filter(Boolean);
  const isSubtask = item.parent_id && uuidByItemId.has(item.parent_id);
  if (isSubtask) tags.push('subtask');

  const due = item.due ? isoBasic(item.due.date) : undefined;
  let recur;
  if (item.due && item.due.is_recurring) {
    recur = parseRecur(item.due.string);
    if (recur) stats.recurMapped++;
    else {
      stats.recurUnmapped++;
      tags.push('recurring');
    }
  }

  const annotations = [];
  const entry = isoBasic(item.added_at) || NOW;
  if (item.description && item.description.trim()) {
    annotations.push({ entry, description: item.description.trim() });
  }
  if (item.due && item.due.is_recurring && item.due.string) {
    annotations.push({ entry, description: `Todoist recurrence: ${item.due.string}` });
  }

  const childIds = childrenByParent.get(item.id) || [];
  const depends = childIds.map(cid => uuidByItemId.get(cid)).filter(Boolean);

  // For recurring parents with a Todoist due-date in the past, anchor `due` to
  // NOW. Otherwise Taskwarrior backfills one child per missed cycle (a daily
  // task overdue by a year = ~365 historical pendings). Future dues — yearly
  // birthdays, etc. — stay as-is so they fire on the real date.
  const taskDue = recur ? ((due && due >= NOW) ? due : NOW) : due;

  const t = {
    uuid,
    description: item.content,
    status: recur ? 'recurring' : 'pending',
    entry,
  };
  const project = buildProjectField(item);
  if (project) t.project = project;
  if (tags.length) t.tags = Array.from(new Set(tags));
  const prio = PRIORITY_MAP[item.priority];
  if (prio) t.priority = prio;
  if (taskDue) t.due = taskDue;
  if (recur) t.recur = recur;
  if (annotations.length) t.annotations = annotations;
  if (depends.length) t.depends = depends.join(',');

  tasks.push(t);
  stats.total++;
  const k = project || '(no project)';
  stats.byProject[k] = (stats.byProject[k] || 0) + 1;
}

fs.writeFileSync(OUT, JSON.stringify(tasks, null, 2));

console.log(`Wrote ${stats.total} tasks → ${OUT}`);
console.log(`Recurrence: ${stats.recurMapped} mapped, ${stats.recurUnmapped} kept as +recurring tag`);
console.log('By project:');
for (const [p, n] of Object.entries(stats.byProject).sort()) {
  console.log(`  ${String(n).padStart(4)}  ${p}`);
}
