<template>
	<v-menu
		v-model="open"
		:position-x="positionX"
		:position-y="positionY"
		:close-on-content-click="false"
		absolute
		offset-y
		min-width="180"
		max-width="220"
		transition="fade-transition"
		content-class="tw-rowctx__menu"
	>
		<div
			class="tw-rowctx"
			role="menu"
			aria-label="Task actions"
			@keydown.esc.stop.prevent="close"
		>
			<button
				type="button"
				role="menuitem"
				class="tw-rowctx__item"
				:disabled="!canReschedule"
				@click="onReschedule"
			>
				<v-icon size="16" class="tw-rowctx__icon" aria-hidden="true">mdi-calendar-edit</v-icon>
				<span>Reschedule</span>
			</button>
			<button
				type="button"
				role="menuitem"
				class="tw-rowctx__item"
				:disabled="!canComplete"
				@click="onComplete"
			>
				<v-icon size="16" class="tw-rowctx__icon" aria-hidden="true">{{ completeIcon }}</v-icon>
				<span>{{ completeLabel }}</span>
			</button>
			<template v-if="moveTargets.length">
				<div class="tw-rowctx__sep" role="separator" />
				<div class="tw-rowctx__label">Move to</div>
				<button
					v-for="p in moveTargets"
					:key="p"
					type="button"
					role="menuitem"
					class="tw-rowctx__item"
					@click="onMove(p)"
				>
					<v-icon size="16" class="tw-rowctx__icon" aria-hidden="true">mdi-swap-horizontal</v-icon>
					<span>{{ p }}</span>
				</button>
			</template>
			<div class="tw-rowctx__sep" role="separator" />
			<button
				type="button"
				role="menuitem"
				class="tw-rowctx__item tw-rowctx__item--danger"
				@click="onDelete"
			>
				<v-icon size="16" class="tw-rowctx__icon" aria-hidden="true">{{ deleteIcon }}</v-icon>
				<span>{{ deleteLabel }}</span>
			</button>
		</div>
	</v-menu>
</template>

<script lang="ts">
import { defineComponent, computed, PropType, useStore } from '@nuxtjs/composition-api';
import { Task } from 'taskwarrior-lib';
import { accessorType, TaskWithProfile } from '../store';

export default defineComponent({
	props: {
		value: { type: Boolean, default: false },
		task: { type: Object as PropType<Task | null>, default: null },
		positionX: { type: Number, default: 0 },
		positionY: { type: Number, default: 0 }
	},

	setup(props, ctx) {
		const store = useStore<typeof accessorType>();

		const open = computed({
			get: () => props.value,
			set: v => ctx.emit('input', v)
		});

		// A task can be moved to another profile only when it's a standalone,
		// real, live task: recurring templates / child instances and collapsed
		// series representatives would break their series if relocated, and an
		// already-deleted task can't be re-deleted from the source (the move's
		// final step), which would surface a spurious "leftover" warning.
		const canMove = computed(() => {
			const t = props.task as (TaskWithProfile & { _siblingUuids?: string[] }) | null;
			if (!t || !t.uuid) return false;
			if (t.status === 'recurring' || t.status === 'deleted' || (t as any).parent) return false;
			if (t._siblingUuids && t._siblingUuids.length) return false;
			return true;
		});

		// Other profiles this task could move to (every allowed profile except
		// the one it already lives in). Empty unless we're multi-profile.
		const moveTargets = computed(() => {
			if (!store.getters.multiProfile || !canMove.value) return [];
			const current = (props.task as TaskWithProfile | null)?._profile;
			return store.state.profiles.map(p => p.name).filter(n => n !== current);
		});

		const canReschedule = computed(() => {
			const t = props.task;
			if (!t) return false;
			// Reschedule changes `due`. Recurring templates regenerate it,
			// completed/deleted tasks have no live schedule.
			return t.status !== 'recurring'
				&& t.status !== 'deleted'
				&& t.status !== 'completed';
		});

		const isDoneish = computed(() =>
			props.task?.status === 'completed' || props.task?.status === 'deleted'
		);
		const completeLabel = computed(() => isDoneish.value ? 'Restore' : 'Complete');
		const completeIcon = computed(() => isDoneish.value ? 'mdi-restore' : 'mdi-check');
		// Mirror togglePending in TaskList: it only acts on
		// pending/completed/deleted, so recurring and waiting are no-ops.
		const canComplete = computed(() => {
			const s = props.task?.status;
			return s === 'pending' || s === 'completed' || s === 'deleted';
		});

		const isSeries = computed(() => {
			const t = props.task as any;
			return t && (t.status === 'recurring' || !!t.parent);
		});
		const deleteLabel = computed(() => isSeries.value ? 'Stop series' : 'Delete');
		const deleteIcon = computed(() => isSeries.value ? 'mdi-restart-off' : 'mdi-delete-outline');

		const close = () => {
			open.value = false;
		};

		const onReschedule = () => {
			if (!canReschedule.value || !props.task) return;
			ctx.emit('reschedule', props.task);
			close();
		};
		const onComplete = () => {
			if (!props.task || !canComplete.value) return;
			ctx.emit('complete', props.task);
			close();
		};
		const onDelete = () => {
			if (!props.task) return;
			ctx.emit('delete', props.task);
			close();
		};
		const onMove = (toProfile: string) => {
			if (!props.task) return;
			ctx.emit('move', { task: props.task, toProfile });
			close();
		};

		return {
			open,
			canReschedule,
			canComplete,
			completeLabel,
			completeIcon,
			deleteLabel,
			deleteIcon,
			moveTargets,
			close,
			onReschedule,
			onComplete,
			onDelete,
			onMove
		};
	}
});
</script>

<style>
.tw-rowctx__menu {
	border-radius: 8px;
	box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
	overflow: hidden;
}
.theme--dark .tw-rowctx__menu {
	box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.4);
}
</style>

<style scoped>
.tw-rowctx {
	background: #fff;
	border: 1px solid rgba(0, 0, 0, 0.08);
	border-radius: 8px;
	overflow: hidden;
	padding: 4px 0;
	font-size: 13px;
}
.theme--dark .tw-rowctx {
	background: #1f1f1f;
	border-color: rgba(255, 255, 255, 0.08);
}

.tw-rowctx__item {
	display: flex;
	align-items: center;
	gap: 10px;
	width: 100%;
	padding: 7px 12px;
	border: none;
	background: transparent;
	color: inherit;
	font: inherit;
	text-align: left;
	cursor: pointer;
	transition: background-color 0.08s ease;
}
.tw-rowctx__item:hover:not(:disabled),
.tw-rowctx__item:focus-visible:not(:disabled) {
	background: rgba(0, 0, 0, 0.05);
	outline: none;
}
.theme--dark .tw-rowctx__item:hover:not(:disabled),
.theme--dark .tw-rowctx__item:focus-visible:not(:disabled) {
	background: rgba(255, 255, 255, 0.06);
}
.tw-rowctx__item:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}
.tw-rowctx__item--danger {
	color: #c62828;
}
.theme--dark .tw-rowctx__item--danger {
	color: #ef9a9a;
}
.tw-rowctx__icon {
	opacity: 0.7;
}
.tw-rowctx__label {
	padding: 4px 12px 2px;
	font-size: 11px;
	font-weight: 600;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	opacity: 0.5;
}
.tw-rowctx__sep {
	height: 1px;
	background: rgba(0, 0, 0, 0.06);
	margin: 4px 0;
}
.theme--dark .tw-rowctx__sep {
	background: rgba(255, 255, 255, 0.06);
}
</style>
