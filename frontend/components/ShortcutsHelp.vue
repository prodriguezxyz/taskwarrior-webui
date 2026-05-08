<template>
	<v-dialog
		v-model="showDialog"
		max-width="520px"
		@keydown.esc="showDialog = false"
	>
		<v-card class="tw-shortcuts">
			<v-card-title class="tw-shortcuts__title">
				Keyboard shortcuts
			</v-card-title>

			<v-card-text class="tw-shortcuts__body">
				<div
					v-for="group in groups"
					:key="group.title"
					class="tw-shortcuts__group"
				>
					<div class="tw-shortcuts__heading">{{ group.title }}</div>
					<div
						v-for="item in group.items"
						:key="item.label"
						class="tw-shortcuts__row"
					>
						<span class="tw-shortcuts__label">{{ item.label }}</span>
						<span class="tw-shortcuts__keys">
							<template v-for="(k, idx) in item.keys">
								<kbd :key="`${item.label}-${idx}`" class="tw-kbd">{{ k }}</kbd>
								<span
									v-if="idx < item.keys.length - 1"
									:key="`${item.label}-sep-${idx}`"
									class="tw-shortcuts__sep"
								>{{ item.join || 'or' }}</span>
							</template>
						</span>
					</div>
				</div>
			</v-card-text>
		</v-card>
	</v-dialog>
</template>

<script lang="ts">
import { defineComponent, computed } from '@nuxtjs/composition-api';

export default defineComponent({
	props: {
		value: Boolean
	},

	setup(props, ctx) {
		const showDialog = computed({
			get: () => props.value,
			set: val => ctx.emit('input', val)
		});

		const groups = [
			{
				title: 'Global',
				items: [
					{ label: 'New task', keys: ['q', 'a'] },
					{ label: 'Search', keys: ['/', 'Ctrl+K'] },
					{ label: 'Sync', keys: ['s'] },
					{ label: 'Refresh', keys: ['r'] },
					{ label: 'Show shortcuts', keys: ['?'] }
				]
			},
			{
				title: 'Navigation',
				items: [
					{ label: 'Inbox', keys: ['g', 'i'], join: 'then' },
					{ label: 'Today', keys: ['g', 't'], join: 'then' },
					{ label: 'Projects', keys: ['g', 'p'], join: 'then' },
					{ label: 'Tags', keys: ['g', 'g'], join: 'then' }
				]
			},
			{
				title: 'Task list',
				items: [
					{ label: 'Move cursor', keys: ['j / k', '↓ / ↑'] },
					{ label: 'Edit', keys: ['Enter', 'e'] },
					{ label: 'Reschedule', keys: ['r'] },
					{ label: 'Toggle complete', keys: ['Space'] },
					{ label: 'Toggle selection', keys: ['x'] },
					{ label: 'Close / cancel', keys: ['Esc'] }
				]
			}
		];

		return { showDialog, groups };
	}
});
</script>

<style scoped>
.tw-shortcuts__title {
	font-size: 15px;
	font-weight: 600;
	padding: 16px 20px 8px;
}
.tw-shortcuts__body {
	padding: 8px 20px 20px !important;
}
.tw-shortcuts__group + .tw-shortcuts__group {
	margin-top: 16px;
}
.tw-shortcuts__heading {
	font-size: 11px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	opacity: 0.55;
	margin-bottom: 6px;
}
.tw-shortcuts__row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 6px 0;
	font-size: 13px;
}
.tw-shortcuts__label {
	opacity: 0.85;
}
.tw-shortcuts__keys {
	display: inline-flex;
	align-items: center;
	gap: 4px;
}
.tw-shortcuts__sep {
	font-size: 11px;
	opacity: 0.5;
	margin: 0 2px;
}
.tw-kbd {
	display: inline-block;
	min-width: 22px;
	padding: 2px 6px;
	border-radius: 4px;
	border: 1px solid rgba(128, 128, 128, 0.35);
	background: rgba(128, 128, 128, 0.08);
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 11px;
	text-align: center;
	line-height: 1.4;
}
</style>
