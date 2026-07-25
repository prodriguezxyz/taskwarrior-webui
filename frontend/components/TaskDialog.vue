<template>
	<v-dialog
		v-model="showDialog"
		max-width="600px"
		persistent
		@keydown.esc="onEscape"
	>
		<v-card>
			<v-card-title>
				<span>{{ task ? 'Edit Task' : 'New Task' }}</span>
				<v-spacer />
				<v-btn
					v-if="parentTemplate"
					text
					small
					class="text-none tw-edit-series"
					title="Open the recurring template that generated this instance"
					@click="editParent"
				>
					<v-icon left small>mdi-restart</v-icon>
					Edit series
				</v-btn>
			</v-card-title>
			<v-card-text>
				<v-form ref="formRef" lazy-validation>
					<v-text-field
						autofocus
						v-model="formData.description"
						label="Description*"
						:rules="requiredRules"
						required
					/>
					<v-combobox
						ref="projectComboRef"
						v-model="projectModel"
						:items="projectItems"
						:item-text="multiProfile ? 'text' : undefined"
						:return-object="multiProfile"
						:search-input.sync="projectSearch"
						hide-selected
						label="Project"
						@change="onProjectChange"
					/>
					<div v-if="willMove" class="tw-move-hint">
						<v-icon x-small left>mdi-swap-horizontal</v-icon>{{ moveHint }}
					</div>
					<v-select
						v-if="memberItems.length > 1"
						v-model="formData.assignee"
						:items="memberItems"
						item-text="label"
						item-value="email"
						label="Assigned to"
						clearable
						prepend-inner-icon="mdi-account-outline"
					/>
					<v-combobox
						v-model="formData.tags"
						:items="tags"
						:search-input.sync="tagsSearch"
						hide-selected
						small-chips
						deletable-chips
						multiple
						label="Tags"
						hint="Press tab or enter to add new tags"
						@change="onTagsChange"
					/>
					<v-row class="px-3">
						<DateTimeInput
							class="mr-3"
							v-model="formData.due"
							:label="recur ? 'Due*' : 'Due'"
							:rules="recur ? requiredRules : []"
							:required="recur"
							show-time
						/>
						<DateTimeInput
							v-model="formData.until"
							label="Until"
						/>
					</v-row>
					<v-row class="px-3">
						<DateTimeInput
							class="mr-3"
							v-model="formData.scheduled"
							label="Scheduled"
							show-time
						/>
						<DateTimeInput
							v-model="formData.wait"
							label="Wait"
						/>
					</v-row>
					<v-row class="px-3">
						<v-checkbox v-model="recur" class="mr-3" label="Recur" />
						<v-text-field
							label="period*"
							v-model="formData.recur"
							:rules="recur ? requiredRules : []"
							:required="recur"
							:disabled="!recur"
						/>
					</v-row>
					<v-radio-group v-model="formData.priority" row hide-details class="align-center">
						<template v-slot:prepend>
							<span class="mr-3 subtitle-1">
								Priority
							</span>
						</template>
						<v-radio
							v-for="p in priorities"
							:key="p.text"
							:label="p.text"
							:value="p.value"
						/>
					</v-radio-group>

					<v-list subheader dense flat>
						<v-subheader>Annotations</v-subheader>
						<v-list-item>
							<v-list-item-content>
								<v-text-field
									placeholder="Annotation text"
									v-model="addAnnotationDescription"
								/>
							</v-list-item-content>
							<v-list-item-action>
								<v-btn
									class="primary ml-1"
									fab
									dark
									x-small
									title="Add annotation"
									@click="addAnnotation"
								>
									<v-icon>mdi-plus</v-icon>
								</v-btn>
							</v-list-item-action>
						</v-list-item>
						<v-list-item v-for="a in formData.annotations" :key="a.entry">
							<v-list-item-content>
								<v-list-item-title v-text="a.description" class="text-wrap"></v-list-item-title>
								<v-list-item-subtitle v-text="a.entry"></v-list-item-subtitle>
							</v-list-item-content>
						</v-list-item>
					</v-list>
				</v-form>
			</v-card-text>

			<v-card-actions>
				<v-btn
					v-if="canComplete"
					text
					color="success"
					class="text-none tw-complete-task"
					title="Mark as done"
					:disabled="submitting"
					@click="completeTask"
				>
					<v-icon left small>mdi-check</v-icon>
					Complete
				</v-btn>
				<v-spacer />
				<v-btn text :disabled="submitting" @click="closeDialog" width="80px">
					Cancel
				</v-btn>
				<v-btn
					color="primary"
					:loading="submitting"
					:disabled="submitting"
					:width="willMove ? undefined : '80px'"
					@click="submit"
				>
					{{ submitLabel }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script lang="ts">
import { defineComponent, useStore, watch, computed, ref, nextTick } from '@nuxtjs/composition-api';
import { Task } from 'taskwarrior-lib';
import { accessorType, TaskWithProfile } from '../store';

export default defineComponent({
	props: {
		value: Boolean,
		task: {
			type: Object as () => Task,
			required: false
		}
	},
	setup(props, ctx) {
		const store = useStore<typeof accessorType>();

		// Profile this dialog operates on. For new tasks and same-profile edits
		// it matches the active profile; for cross-profile edits it follows
		// the task's _profile so suggestions / assignees stay correct.
		const contextProfile = computed(() =>
			(props.task as TaskWithProfile | undefined)?._profile ?? store.state.settings.profile
		);
		const isCrossProfile = computed(() =>
			store.getters.multiProfile
			&& contextProfile.value !== store.state.settings.profile
		);

		const multiProfile = computed(() => store.getters.multiProfile);

		// Destination profile chosen via the Project picker. Defaults to the
		// profile the task already lives in; only diverges when the user picks a
		// project that belongs to a different profile (→ triggers a move).
		const targetProfile = ref(contextProfile.value);
		const willMove = computed(() =>
			multiProfile.value && targetProfile.value !== contextProfile.value
		);
		const moveHint = computed(() =>
			props.task
				? `Will move to "${targetProfile.value}"`
				: `Will be created in "${targetProfile.value}"`
		);
		const submitLabel = computed(() => {
			if (!willMove.value) return 'Submit';
			return props.task ? `Move to ${targetProfile.value}` : `Add to ${targetProfile.value}`;
		});
		const canComplete = computed(() =>
			Boolean(props.task && props.task.status === 'pending')
		);

		const inContext = (t: Task) =>
			!store.getters.multiProfile
			|| (t as TaskWithProfile)._profile === contextProfile.value;

		const projects = computed(() => {
			const set = new Set<string>();
			for (const t of store.state.tasks) {
				if (!inContext(t)) continue;
				if (t.status === 'deleted') continue;
				if (t.project) set.add(t.project);
			}
			return Array.from(set).sort();
		});

		// Items for the Project picker. Single-profile: plain strings (unchanged).
		// Multi-profile: projects of EVERY profile, grouped under Vuetify header /
		// divider rows, with the task's own profile listed first. Picking one from
		// another profile sets targetProfile and moves the task there on submit.
		const projectItems = computed(() => {
			if (!multiProfile.value) return projects.value;
			const byProfile = new Map<string, Set<string>>();
			for (const t of store.state.tasks) {
				if (t.status === 'deleted') continue;
				if (!t.project) continue;
				const prof = (t as TaskWithProfile)._profile || contextProfile.value;
				if (!byProfile.has(prof)) byProfile.set(prof, new Set());
				byProfile.get(prof)!.add(t.project);
			}
			const order = [
				contextProfile.value,
				...store.state.profiles.map(p => p.name).filter(n => n !== contextProfile.value)
			];
			const items: any[] = [];
			for (const prof of order) {
				const set = byProfile.get(prof);
				if (!set || set.size === 0) continue;
				if (items.length > 0) items.push({ divider: true });
				items.push({ header: prof });
				for (const proj of Array.from(set).sort()) {
					items.push({ text: proj, project: proj, profile: prof });
				}
			}
			return items;
		});

		const tags = computed(() => {
			const set = new Set<string>();
			for (const t of store.state.tasks) {
				if (!inContext(t)) continue;
				if (t.tags) for (const tg of t.tags) set.add(tg);
			}
			return Array.from(set).sort();
		});

		// Cross-profile: fetched once per dialog open; same-profile: live
		// view of state.members via computed below.
		const fetchedMembers = ref<Array<{ email: string, name: string }>>([]);
		watch([() => props.value, contextProfile], ([open]) => {
			if (open && isCrossProfile.value) {
				store.dispatch('fetchMembersFor', contextProfile.value)
					.then(m => {
						fetchedMembers.value = m;
					})
					.catch(err => {
						console.error('[TaskDialog] fetchMembersFor failed:', err);
					});
			}
		}, { immediate: true });

		const dialogMembers = computed(() =>
			isCrossProfile.value ? fetchedMembers.value : store.state.members
		);

		const memberItems = computed(() =>
			dialogMembers.value.map(m => ({
				email: m.email,
				label: m.name || m.email.split('@')[0]
			}))
		);

		const showDialog = computed({
			get: () => props.value,
			set: val => ctx.emit('input', val)
		});

		// Surfaced when editing a recurring child instance: lets the user jump to
		// the parent template (status='recurring') without leaving Today view to
		// hunt for it in the Recurring filter. Profile-scoped so a child never
		// resolves to a parent UUID that lives in another profile.
		const parentTemplate = computed(() => {
			const t = props.task as TaskWithProfile | undefined;
			const parentUuid = (t as any)?.parent as string | undefined;
			if (!parentUuid) return null;
			const profile = t?._profile;
			return store.state.tasks.find(p =>
				p.uuid === parentUuid
				&& (!store.getters.multiProfile || (p as TaskWithProfile)._profile === profile)
			) || null;
		});

		const editParent = () => {
			if (!parentTemplate.value) return;
			store.commit('openEditTaskDialog', JSON.parse(JSON.stringify(parentTemplate.value)));
		};

		const requiredRules = [
			(str: string) => Boolean(str) || 'Required'
		];

		const addAnnotationDescription = ref('');
		const projectSearch = ref<string | null>('');
		const projectComboRef = ref<any>(null);
		// Display model for the Project combobox. Kept separate from
		// formData.project: the combobox returns the whole item object in
		// multi-profile mode, so onProjectChange normalises it back to a string
		// here while recording the chosen project + targetProfile.
		const projectModel = ref<any>((props.task as any)?.project || '');

		// v-combobox commits whatever text is in the input on Enter/blur, even
		// when it's only a prefix of an existing item. We remap that committed
		// value to the best matching project ("auto" → "automation"). Prefer
		// prefix matches over arbitrary substring matches.
		const bestMatch = (val: string, pool: string[]) => {
			const lower = val.toLowerCase();
			if (pool.some(p => p.toLowerCase() === lower)) return null;
			const prefix = pool.filter(p => p.toLowerCase().startsWith(lower));
			if (prefix[0]) return prefix[0];
			const substring = pool.filter(p => p.toLowerCase().includes(lower));
			return substring[0] || null;
		};

		const exactProjectMatch = (val: string) => {
			if (!multiProfile.value) return null;
			const lower = val.toLowerCase();
			const matches = (projectItems.value as any[])
				.filter(item => item && item.project && item.project.toLowerCase() === lower);
			if (!matches.length) return null;
			const current = matches.find(item => item.profile === contextProfile.value);
			if (current) return current;
			const profiles = Array.from(new Set(matches.map(item => item.profile)));
			return profiles.length === 1 ? matches[0] : null;
		};

		const onProjectChange = (val: any) => {
			if (val && typeof val === 'object') {
				// Picked an existing project item; it may live in another profile,
				// in which case targetProfile diverges → submit() performs a move.
				formData.value.project = val.project;
				targetProfile.value = val.profile;
				projectModel.value = val.text;
				projectSearch.value = val.text;
			}
			else {
				// Free text (or cleared): exact unique cross-profile project names
				// route there; otherwise new/existing projects stay in context.
				const str = val ? String(val) : '';
				const exact = str ? exactProjectMatch(str) : null;
				const candidate = !exact && str ? bestMatch(str, projects.value as string[]) : null;
				const finalProj = exact ? exact.project : (candidate || str);
				formData.value.project = finalProj;
				targetProfile.value = exact?.profile || contextProfile.value;
				projectModel.value = finalProj;
				projectSearch.value = finalProj;
			}
			// Close the dropdown after a single-select commit. Deferred so the
			// remap above lands before blur reads the combobox internal state.
			nextTick(() => projectComboRef.value?.blur());
		};

		const tagsSearch = ref<string | null>('');
		const onTagsChange = (vals: string[] | null) => {
			if (!vals || !vals.length) return;
			const pool = tags.value as string[];
			let changed = false;
			const remapped = vals.map(v => {
				const candidate = bestMatch(String(v), pool);
				if (candidate && candidate !== v) {
					changed = true;
					return candidate;
				}
				return v;
			});
			// Dedupe in case remapping collapsed two entries onto the same tag.
			const unique = Array.from(new Set(remapped));
			if (changed || unique.length !== vals.length) {
				formData.value.tags = unique;
			}
			tagsSearch.value = null;
		};

		const recur = ref(Boolean(props.task?.recur));
		const formData = ref({
			description: '',
			project: '',
			assignee: '',
			scheduled: '',
			due: '',
			until: '',
			wait: '',
			tags: [] as string[],
			annotations: [] as {entry: string; description: string}[],
			priority: 'N',
			recur: '',
			...props.task
		});

		const reset = () => {
			formData.value = {
				description: '',
				project: '',
				assignee: '',
				scheduled: '',
				due: '',
				until: '',
				wait: '',
				tags: [] as string[],
				annotations: [] as {entry: string; description: string}[],
				priority: 'N',
				recur: '',
				...props.task
			};
			recur.value = Boolean(props.task?.recur);
			if (formRef.value) {
				(formRef.value as any).resetValidation();
			}

			addAnnotationDescription.value = '';
			projectModel.value = formData.value.project || '';
			projectSearch.value = formData.value.project || '';
			targetProfile.value = contextProfile.value;
		};

		watch(() => props.task, () => {
			reset();
		});

		const formRef = ref(null);
		const submitting = ref(false);

		const addAnnotation = () => {
			formData.value.annotations.push({
				entry: new Date().toISOString(),
				description: addAnnotationDescription.value
			});

			addAnnotationDescription.value = '';
		};

		const closeDialog = () => {
			showDialog.value = false;
			reset();
		};
		const onEscape = () => {
			if (!submitting.value) closeDialog();
		};

		const undoTask = async (original: Task) => {
			try {
				await store.dispatch('updateTasks', [original]);
			}
			catch (err) {
				store.commit('setNotification', { color: 'error', text: 'Failed to undo' });
			}
		};

		const completeTask = async () => {
			if (!props.task || !canComplete.value) return;
			const original = JSON.parse(JSON.stringify(props.task));
			try {
				await store.dispatch('updateTasks', [{
					...props.task,
					status: 'completed'
				}]);
			}
			catch (err) {
				store.commit('setNotification', {
					color: 'error',
					text: 'Failed to complete task'
				});
				return;
			}
			store.commit('setNotification', {
				color: 'success',
				text: 'Task completed',
				actionText: 'Undo',
				actionHandler: () => undoTask(original)
			});
			closeDialog();
		};

		const submit = async () => {
			if (submitting.value) return;
			const valid = (formRef.value as any).validate();
			if (!valid) return;
			submitting.value = true;
			// Editing a task whose chosen destination profile differs from where
			// it currently lives → a cross-profile move (create in dest + delete
			// from source) rather than a plain update.
			const crossProfile = Boolean(props.task) && willMove.value;
			const payload: any = {
				...formData.value,
				annotations: formData.value.annotations || [],
				project: formData.value.project || undefined,
				// Member lists are per-profile, so a source-profile assignee is
				// meaningless in the destination — drop it when crossing profiles.
				assignee: crossProfile ? undefined : (formData.value.assignee || undefined),
				scheduled: formData.value.scheduled || undefined,
				due: formData.value.due || undefined,
				until: formData.value.until || undefined,
				wait: formData.value.wait || undefined,
				priority: formData.value.priority === 'N' ? undefined : formData.value.priority,
				recur: recur.value ? formData.value.recur : undefined,
				// Destination profile applied LAST so the props.task spread above
				// (which carries the original _profile) can't override it. For new
				// tasks this routes to whatever profile the user picked, defaulting
				// to the active one.
				_profile: targetProfile.value || undefined
			};
			try {
				if (crossProfile) {
					await store.dispatch('moveTask', {
						task: payload,
						fromProfile: contextProfile.value,
						toProfile: targetProfile.value
					});
				}
				else {
					await store.dispatch('updateTasks', [payload]);
				}
			}
			catch (err) {
				submitting.value = false;
				const leftover = (err as any)?.moveLeftover;
				if (leftover) {
					// The move created the task in the destination but couldn't
					// remove the source copy. Primary intent succeeded → warn + close.
					store.commit('setNotification', {
						color: 'warning',
						text: `Moved to ${leftover.toProfile}, but couldn't remove the original from ${leftover.fromProfile} — delete it manually`
					});
					closeDialog();
					return;
				}
				// Leave the dialog open so the user can fix or retry without
				// losing their edits.
				store.commit('setNotification', {
					color: 'error',
					text: `Failed to ${crossProfile ? 'move' : (props.task ? 'update' : 'create')} the task`
				});
				return;
			}
			submitting.value = false;
			store.commit('setNotification', {
				color: 'success',
				text: `Successfully ${crossProfile ? 'moved' : (props.task ? 'updated' : 'created')} the task`
			});
			closeDialog();
		};

		const priorities = [
			{ text: 'None', value: 'N' },
			{ text: 'Low', value: 'L' },
			{ text: 'Medium', value: 'M' },
			{ text: 'High', value: 'H' }
		];

		return {
			requiredRules,
			formRef,
			tags,
			projects,
			projectItems,
			projectModel,
			multiProfile,
			willMove,
			moveHint,
			submitLabel,
			canComplete,
			memberItems,
			priorities,
			recur,
			formData,
			addAnnotationDescription,
			addAnnotation,
			closeDialog,
			onEscape,
			completeTask,
			submit,
			submitting,
			showDialog,
			projectSearch,
			projectComboRef,
			onProjectChange,
			tagsSearch,
			onTagsChange,
			parentTemplate,
			editParent
		};
	}
});
</script>

<style scoped>
.tw-edit-series {
	letter-spacing: normal;
	font-size: 13px;
	opacity: 0.85;
}
.tw-edit-series:hover {
	opacity: 1;
}
.tw-move-hint {
	margin-top: -8px;
	margin-bottom: 8px;
	font-size: 12px;
	opacity: 0.7;
	display: flex;
	align-items: center;
}
.tw-move-hint .v-icon {
	opacity: 0.7;
}
</style>
