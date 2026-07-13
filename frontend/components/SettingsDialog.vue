<template>
	<v-dialog
		v-model="showDialog"
		max-width="400px"
		@keydown.esc="closeDialog"
	>
		<v-card>
			<v-card-title>
				Settings
			</v-card-title>
			<v-card-text>
				<v-form ref="formRef">
					<v-list-item>
						<v-list-item-content>
							<v-list-item-title>
								Dark
							</v-list-item-title>
							<v-list-item-subtitle>
								default theme
							</v-list-item-subtitle>
						</v-list-item-content>
						<v-list-item-action>
							<v-checkbox v-model="settings.dark" />
						</v-list-item-action>
					</v-list-item>

					<v-list-item>
						<v-list-item-content>
							<v-list-item-title>
								Auto Refresh
							</v-list-item-title>
							<v-list-item-subtitle>
								in minutes (0 means no refresh)
							</v-list-item-subtitle>
						</v-list-item-content>
						<v-list-item-action>
							<v-text-field
								v-model="settings.autoRefresh"
								type="number"
								inputmode="numeric"
								min="0"
								style="width: 56px"
								:rules="numberRules"
							/>
						</v-list-item-action>
					</v-list-item>

					<v-list-item>
						<v-list-item-content>
							<v-list-item-title class="pb-1">
								Auto Sync
								<button
									type="button"
									class="tw-icon-btn tw-icon-btn--inline"
									title="Sync immediately"
									aria-label="Sync now"
									@click="sync"
								>
									<v-icon size="18px" aria-hidden="true">mdi-sync</v-icon>
								</button>
							</v-list-item-title>
							<v-list-item-subtitle>
								in minutes (0 means no auto sync)<br />
								run <code>task sync</code> periodically
							</v-list-item-subtitle>
						</v-list-item-content>
						<v-list-item-action>
							<v-text-field
								v-model="settings.autoSync"
								type="number"
								inputmode="numeric"
								min="0"
								style="width: 56px"
								:rules="numberRules"
							/>
						</v-list-item-action>
					</v-list-item>

					<v-list-item>
						<v-list-item-content>
							<v-list-item-title>
								Hidden tags
							</v-list-item-title>
							<v-list-item-subtitle>
								comma-separated; hidden from rows but kept for filters
							</v-list-item-subtitle>
							<v-text-field
								v-model="settings.hiddenTags"
								placeholder="todoist-import, subtask…"
								aria-label="Hidden tags"
								class="pt-2"
								dense
								hide-details
							/>
						</v-list-item-content>
					</v-list-item>
				</v-form>
			</v-card-text>
			<v-card-actions>
				<v-spacer />
				<v-btn text @click="closeDialog">
					Cancel
				</v-btn>
				<v-btn color="primary" @click="save">
					Save
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script lang="ts">
import { defineComponent, useStore, computed, ref, reactive } from '@nuxtjs/composition-api';
import { accessorType } from '../store';

export default defineComponent({
	props: {
		value: Boolean
	},

	setup(props, ctx) {
		const store = useStore<typeof accessorType>();

		const showDialog = computed({
			get: () => props.value,
			set: val => ctx.emit('input', val)
		});

		const numberRules = [
			(str: string) => (str && !isNaN(+str) && +str >= 0) || 'invalid'
		];

		const formRef = ref(null);
		const settings = reactive({
			dark: store.state.settings.dark,
			autoRefresh: store.state.settings.autoRefresh,
			autoSync: store.state.settings.autoSync,
			hiddenTags: (store.state.settings.hiddenTags || []).join(', ')
		});

		const reset = () => {
			settings.dark = store.state.settings.dark;
			settings.autoRefresh = store.state.settings.autoRefresh;
			settings.autoSync = store.state.settings.autoSync;
			settings.hiddenTags = (store.state.settings.hiddenTags || []).join(', ');
		};

		const closeDialog = () => {
			showDialog.value = false;
			reset();
		};

		const save = () => {
			const valid = (formRef as any).value.validate();
			if (valid) {
				const hiddenTags = settings.hiddenTags
					.split(',')
					.map(t => t.trim().replace(/^#/, ''))
					.filter(Boolean);
				// Spread the live settings so we don't drop fields the dialog
				// doesn't render (notably `profile` in multi-profile mode).
				store.dispatch('updateSettings', {
					...store.state.settings,
					dark: settings.dark,
					autoRefresh: settings.autoRefresh,
					autoSync: settings.autoSync,
					hiddenTags
				});
				closeDialog();
			}
		};

		const sync = async () => {
			try {
				await store.dispatch('syncTasks');
				store.commit('setNotification', {
					color: 'success',
					text: 'Successfully synced tasks.'
				});
			}
			catch (error: any) {
				const failed: string[] | undefined = error?.failedProfiles;
				const succeeded: number | undefined = error?.succeededCount;
				const text = (failed && failed.length)
					? `Sync failed for: ${failed.join(', ')}` + (succeeded ? ` (${succeeded} ok)` : '')
					: 'Failed to sync tasks.';
				store.commit('setNotification', { color: 'error', text });
			}
		};

		return {
			sync,
			showDialog,
			closeDialog,
			save,
			settings,
			numberRules,
			formRef
		};
	}
});
</script>
