export default {
	server: {
		port: 8080
	},

	/*
  ** Nuxt rendering mode
  ** See https://nuxtjs.org/api/configuration-mode
  */
	ssr: false,
	/*
  ** Nuxt target
  ** See https://nuxtjs.org/api/configuration-target
  */
	target: 'static',
	/*
  ** Headers of the page
  ** See https://nuxtjs.org/api/configuration-head
  */
	head: {
		titleTemplate: '%s',
		title: 'Taskwarrior Webui',
		meta: [
			{ charset: 'utf-8' },
			{ name: 'viewport', content: 'width=device-width, initial-scale=1' },
			{ hid: 'description', name: 'description', content: process.env.npm_package_description || '' },
			{ name: 'theme-color', content: '#0F0F0E' }
		],
		link: [
			{ rel: 'icon', type: 'image/png', href: '/favicon.png' },
			{ rel: 'preconnect', href: 'https://fonts.googleapis.com' },
			{ rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
			{
				rel: 'stylesheet',
				href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
			}
		]
	},
	/*
  ** Global CSS
  */
	css: [
		// mdi font
		'@mdi/font/css/materialdesignicons.css',
		// App css (design system)
		'@/assets/app.css'
	],
	/*
  ** Plugins to load before mounting the App
  ** https://nuxtjs.org/guide/plugins
  */
	plugins: [
		'~/plugins/profile.ts'
	],
	/*
  ** Auto import components
  ** See https://nuxtjs.org/api/configuration-components
  */
	components: true,
	/*
  ** Nuxt.js dev-modules
  */
	buildModules: [
		'@nuxt/typescript-build',
		'@nuxtjs/vuetify',
		'@nuxtjs/composition-api/module'
	],
	/*
  ** Nuxt.js modules
  */
	modules: [
		// Doc: https://axios.nuxtjs.org/usage
		'@nuxtjs/axios',
		'@nuxtjs/pwa',
		'@nuxtjs/proxy'
	],

	pwa: {
		meta: {
			name: 'Taskwarrior-webui'
		},
		manifest: {
			name: 'Taskwarrior-webui',
			short_name: 'Taskwarrior-webui'
		}
	},

	proxy: {
		// Backend
		'/api': {
			target: 'http://localhost:3000/',
			changeOrigin: true,
			pathRewrite: {
				'/api': ''
			}
		}
	},
	/*
  ** Axios module configuration
  ** See https://axios.nuxtjs.org/options
  */
	axios: {
		baseURL: '/'
	},
	/*
  ** vuetify module configuration
  ** https://github.com/nuxt-community/vuetify-module
  */
	vuetify: {
		defaultAssets: false,
		customVariables: ['~/assets/variables.scss'],
		treeShake: true, // to make customVariables work in dev
		theme: {
			themes: {
				light: {
					primary: '#059669',
					secondary: '#6B6B73',
					accent: '#059669',
					error: '#DC2626',
					warning: '#D97706',
					info: '#2563EB',
					success: '#059669',
					background: '#FFFFFF'
				},
				dark: {
					primary: '#34D399',
					secondary: '#8E8E93',
					accent: '#34D399',
					error: '#F87171',
					warning: '#FBBF24',
					info: '#60A5FA',
					success: '#34D399',
					background: '#0F0F10'
				}
			},
			options: {
				customProperties: true
			}
		}
	},
	/*
  ** Build configuration
  ** See https://nuxtjs.org/api/configuration-build/
  */
	build: {
	}
};
