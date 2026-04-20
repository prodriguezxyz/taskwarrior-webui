import { Plugin } from '@nuxt/types';

const plugin: Plugin = async ({ $axios, store }) => {
	store.dispatch('fetchSettings');

	$axios.onRequest(config => {
		const profile = (store.state as any).settings.profile;
		if (profile) {
			config.headers = { ...(config.headers || {}), 'X-Profile': profile };
		}
		return config;
	});

	await store.dispatch('fetchProfiles');
};

export default plugin;
