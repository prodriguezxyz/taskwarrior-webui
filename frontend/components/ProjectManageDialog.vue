<template>
	<v-dialog
		v-model="showDialog"
		max-width="420px"
		@keydown.esc="close"
	>
		<v-card>
			<v-card-title>
				<v-icon size="18" class="tw-project-dialog__icon">mdi-folder-outline</v-icon>
				<span class="tw-project-dialog__title">{{ project }}</span>
				<v-spacer />
				<span class="tw-project-dialog__count">{{ affectedCount }} task{{ affectedCount === 1 ? '' : 's' }}</span>
			</v-card-title>

			<v-card-text class="tw-project-dialog__body">
				<label class="tw-project-dialog__label">Rename</label>
				<v-text-field
					ref="inputRef"
					v-model="newName"
					outlined
					dense
					hide-details="auto"
					:error-messages="error"
					placeholder="new-project-name"
					@keydown.enter="rename"
				/>
				<div class="tw-project-dialog__hint">
					Renames the project on all {{ affectedCount }} task{{ affectedCount === 1 ? '' : 's' }}.
					If a project with the new name already exists, the two are merged.
				</div>
			</v-card-text>

			<v-card-actions class="tw-project-dialog__actions">
				<button
					type="button"
					class="tw-btn tw-btn--ghost tw-btn--danger"
					@click="confirmDelete"
				>
					<v-icon size="16" left>mdi-delete-outline</v-icon>
					Delete project
				</button>
				<v-spacer />
				<button type="button" class="tw-btn tw-btn--ghost" @click="close">Cancel</button>
				<button
					type="button"
					class="tw-btn tw-btn--primary"
					:disabled="!canRename"
					@click="rename"
				>
					Rename
				</button>
			</v-card-actions>
		</v-card>

		<ConfirmationDialog
			v-model="showConfirm"
			:title="'Delete project'"
			:text="deletableCount === 0
				? `Delete project '${project}'? It has no active tasks.`
				: `Delete project '${project}' and all ${deletableCount} task${deletableCount === 1 ? '' : 's'} inside it? Deleted tasks can be restored individually from the Deleted tab.`"
			@yes="remove"
		/>
	</v-dialog>
</template>

<script lang="ts">
import { defineComponent, computed, ref, watch, nextTick, useStore } from '@nuxtjs/composition-api';
import { Task } from 'taskwarrior-lib';
import { accessorType } from '../store';
import ConfirmationDialog from '../components/ConfirmationDialog.vue';

export default defineComponent({
	components: { ConfirmationDialog },

	props: {
		value: Boolean,
		project: {
			type: String,
			default: ''
		}
	},

	setup(props, ctx) {
		const store = useStore<typeof accessorType>();

		const showDialog = computed({
			get: () => props.value,
			set: val => ctx.emit('input', val)
		});

		const newName = ref('');
		const error = ref<string | null>(null);
		const showConfirm = ref(false);
		const inputRef = ref<any>(null);

		const affectedTasks = computed((): Task[] =>
			(store.getters.ownTasks as Task[]).filter(t => t.project === props.project)
		);
		const affectedCount = computed(() => affectedTasks.value.length);
		// For deletion, skip tasks already marked deleted — re-deleting them is a
		// no-op at best and a Taskwarrior error at worst. Rename still touches them
		// so the project label stays consistent across the trash bin too.
		const deletableTasks = computed((): Task[] =>
			affectedTasks.value.filter(t => t.status !== 'deleted')
		);
		const deletableCount = computed(() => deletableTasks.value.length);

		const sanitize = (s: string) => s.trim();

		const canRename = computed(() => {
			const n = sanitize(newName.value);
			return n.length > 0 && n !== props.project && !error.value;
		});

		watch(() => [props.value, props.project], ([open, project]) => {
			if (open) {
				newName.value = project as string;
				error.value = null;
				nextTick(() => {
					const el = inputRef.value?.$el?.querySelector('input') as HTMLInputElement | null;
					el?.select();
				});
			}
		});

		const close = () => {
			showDialog.value = false;
		};

		const rename = async () => {
			if (!canRename.value) return;
			const from = props.project;
			const to = sanitize(newName.value);

			const updated = affectedTasks.value.map(t => ({ ...t, project: to }));

			if (updated.length === 0) {
				close();
				return;
			}

			await store.dispatch('updateTasks', updated);

			if (store.state.projectFilter === from) {
				store.commit('setProjectFilter', to);
			}

			store.commit('setNotification', {
				color: 'success',
				text: `Renamed project to ${to}`
			});
			close();
		};

		const confirmDelete = () => {
			showConfirm.value = true;
		};

		const remove = async () => {
			const from = props.project;
			const toDelete = deletableTasks.value;

			if (toDelete.length > 0) {
				await store.dispatch('deleteTasks', toDelete);
			}

			if (store.state.projectFilter === from) {
				store.commit('setProjectFilter', null);
			}

			const count = toDelete.length;
			store.commit('setNotification', {
				color: 'success',
				text: count === 0
					? `Deleted project ${from}`
					: `Deleted project ${from} and ${count} task${count === 1 ? '' : 's'}`
			});
			showConfirm.value = false;
			close();
		};

		return {
			showDialog,
			newName,
			error,
			canRename,
			showConfirm,
			inputRef,
			affectedCount,
			deletableCount,
			close,
			rename,
			confirmDelete,
			remove
		};
	}
});
</script>
