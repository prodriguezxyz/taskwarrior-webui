<template>
	<v-dialog
		v-model="showDialog"
		max-width="600px"
		persistent
		@keydown.esc="closeDialog"
	>
		<v-card>
			<v-card-title>
				{{ task ? 'Edit Task' : 'New Task' }}
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
						@keydown.enter.native.capture="onProjectEnter"
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
						@keydown.enter.native.capture="onTagsEnter"
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
import { defineComponent, useStore, watch, computed, ref } from '@nuxtjs/composition-api';
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

		const requiredRules = [
			(str: string) => Boolean(str) || 'Required'
		];

		const addAnnotationDescription = ref('');
		const projectSearch = ref<string | null>('');
		const projectComboRef = ref<any>(null);

		const onProjectEnter = (e: KeyboardEvent) => {
			const search = (projectSearch.value || '').trim();
			if (!search) return;
			const searchLower = search.toLowerCase();
			const matches = (projects.value as string[]).filter(
				p => p.toLowerCase().includes(searchLower)
			);
			if (matches.length === 1 && matches[0].toLowerCase() !== searchLower) {
				e.preventDefault();
				e.stopPropagation();
				formData.value.project = matches[0];
				projectSearch.value = matches[0];
				projectComboRef.value?.blur();
			}
		};

		const tagsSearch = ref<string | null>('');
		const onTagsEnter = (e: KeyboardEvent) => {
			const search = (tagsSearch.value || '').trim();
			if (!search) return;
			const searchLower = search.toLowerCase();
			const currentTags = (formData.value.tags || []) as string[];
			const matches = (tags.value as string[]).filter(
				t => t.toLowerCase().includes(searchLower) && !currentTags.includes(t)
			);
			if (matches.length === 1 && matches[0].toLowerCase() !== searchLower) {
				e.preventDefault();
				e.stopPropagation();
				formData.value.tags = [...currentTags, matches[0]];
				tagsSearch.value = null;
			}
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
			onProjectEnter,
			tagsSearch,
			onTagsEnter
		};
	}
});
</script>
