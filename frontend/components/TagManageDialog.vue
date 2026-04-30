<template>
	<v-dialog
		v-model="showDialog"
		max-width="420px"
		@keydown.esc="close"
	>
		<v-card>
			<v-card-title>
				<v-icon size="18" class="tw-tag-dialog__icon">mdi-tag-outline</v-icon>
				<span class="tw-tag-dialog__title">{{ tag }}</span>
				<v-spacer />
				<span class="tw-tag-dialog__count">{{ affectedCount }} task{{ affectedCount === 1 ? '' : 's' }}</span>
			</v-card-title>

			<v-card-text class="tw-tag-dialog__body">
				<label class="tw-tag-dialog__label">Rename</label>
				<v-text-field
					ref="inputRef"
					v-model="newName"
					outlined
					dense
					hide-details="auto"
					:error-messages="error"
					placeholder="new-tag-name"
					@keydown.enter="rename"
				/>
				<div class="tw-tag-dialog__hint">
					Renames the tag on all {{ affectedCount }} task{{ affectedCount === 1 ? '' : 's' }}.
					If the target already exists, the two are merged.
				</div>
			</v-card-text>

			<v-card-actions class="tw-tag-dialog__actions">
				<button
					type="button"
					class="tw-btn tw-btn--ghost tw-btn--danger"
					@click="confirmDelete"
				>
					<v-icon size="16" left>mdi-delete-outline</v-icon>
					Delete tag
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
			:title="'Delete tag'"
			:text="`Remove '${tag}' from ${affectedCount} task${affectedCount === 1 ? '' : 's'}?`"
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
		tag: {
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
			(store.getters.ownTasks as Task[]).filter(t => t.tags?.includes(props.tag))
		);
		const affectedCount = computed(() => affectedTasks.value.length);

		const sanitize = (s: string) => s.trim().replace(/\s+/g, '-');

		const canRename = computed(() => {
			const n = sanitize(newName.value);
			return n.length > 0 && n !== props.tag && !error.value;
		});

		watch(() => [props.value, props.tag], ([open, tag]) => {
			if (open) {
				newName.value = tag as string;
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
			const from = props.tag;
			const to = sanitize(newName.value);

			const updated = affectedTasks.value.map(t => {
				const set = new Set(t.tags || []);
				set.delete(from);
				set.add(to);
				return { ...t, tags: Array.from(set) };
			});

			if (updated.length === 0) {
				close();
				return;
			}

			await store.dispatch('updateTasks', updated);

			if (store.state.tagFilter === from) {
				store.commit('setTagFilter', to);
			}

			store.commit('setNotification', {
				color: 'success',
				text: `Renamed tag to ${to}`
			});
			close();
		};

		const confirmDelete = () => {
			showConfirm.value = true;
		};

		const remove = async () => {
			const from = props.tag;
			const updated = affectedTasks.value.map(t => ({
				...t,
				tags: (t.tags || []).filter(x => x !== from)
			}));

			if (updated.length > 0) {
				await store.dispatch('updateTasks', updated);
			}

			if (store.state.tagFilter === from) {
				store.commit('setTagFilter', null);
			}

			store.commit('setNotification', {
				color: 'success',
				text: `Deleted tag ${from}`
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
			close,
			rename,
			confirmDelete,
			remove
		};
	}
});
</script>
