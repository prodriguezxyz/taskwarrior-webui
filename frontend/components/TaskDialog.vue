<template>
	<v-dialog
		v-model="showDialog"
		max-width="600px"
		persistent
		@keydown.esc="closeDialog"
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
						v-model="formData.project"
						:items="projects"
						:search-input.sync="projectSearch"
						hide-selected
						label="Project"
						@change="onProjectChange"
					/>
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
				<v-spacer />
				<v-btn text @click="closeDialog" width="80px">
					Cancel
				</v-btn>
				<v-btn color="primary" @click="submit" width="80px">
					Submit
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

		const inContext = (t: Task) =>
			!store.getters.multiProfile
			|| (t as TaskWithProfile)._profile === contextProfile.value;

		const projects = computed(() => {
			const set = new Set<string>();
			for (const t of store.state.tasks) {
				if (!inContext(t)) continue;
				if (t.project) set.add(t.project);
			}
			return Array.from(set).sort();
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

		const onProjectChange = (val: string | null) => {
			if (!val) return;
			const candidate = bestMatch(String(val), projects.value as string[]);
			if (candidate) {
				formData.value.project = candidate;
				projectSearch.value = candidate;
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
		};

		watch(() => props.task, () => {
			reset();
		});

		const formRef = ref(null);

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
		const submit = async () => {
			const valid = (formRef.value as any).validate();
			if (!valid) return;
			try {
				await store.dispatch('updateTasks', [{
					// Force the active profile on new tasks. For edits, _profile
					// already rides along through the spread (cloned from the row
					// the dialog was opened on); without this line a "+ new task"
					// from a cross-profile view (Today / Mine) would default to
					// the backend's allowed[0] instead of what the user picked.
					_profile: contextProfile.value || undefined,
					...formData.value,
					annotations: formData.value.annotations || [],
					project: formData.value.project || undefined,
					assignee: formData.value.assignee || undefined,
					scheduled: formData.value.scheduled || undefined,
					due: formData.value.due || undefined,
					until: formData.value.until || undefined,
					wait: formData.value.wait || undefined,
					priority: formData.value.priority === 'N' ? undefined : formData.value.priority,
					recur: recur.value ? formData.value.recur : undefined
				}]);
			}
			catch (err) {
				// Leave the dialog open so the user can fix or retry without
				// losing their edits.
				store.commit('setNotification', {
					color: 'error',
					text: `Failed to ${props.task ? 'update' : 'create'} the task`
				});
				return;
			}
			store.commit('setNotification', {
				color: 'success',
				text: `Successfully ${props.task ? 'update' : 'create'} the task`
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
			memberItems,
			priorities,
			recur,
			formData,
			addAnnotationDescription,
			addAnnotation,
			closeDialog,
			submit,
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
</style>
