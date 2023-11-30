import { RouteRecordRaw } from '.nuxt/vue-router';
import type { RouterConfig } from '@nuxt/schema';

export default <RouterOptions>{
  routes: (_routes) => {
    const { ssrContext } = useNuxtApp();
    const subdomain = useSubdomain();
    if (ssrContext?.event.context.subdomain && ssrContext?.event.context.subdomain === 'number') {
      subdomain.value = ssrContext?.event.context.subdomain.toString();
    } else if (ssrContext?.event.context.subdomain) {
      subdomain.value = ssrContext?.event.context.subdomain;
    } else {
      console.log('no change');
    }

    if (subdomain.value === '10') {
      console.log('health check route');
      return _routes;
    } else if (!subdomain.value.includes('localhost')) {
      const subDomainRoute = _routes.filter((i) => i.path.includes(`${subdomain.value}`));
      const routeMapped = subDomainRoute.map((i) => ({
        ...i,
        path:
          i.path === `/${subdomain.value}`
            ? i.path.replace(/\.*.-corp/g, '')
            : i.path.replace(/\.*.-corp\//g, ''),
        // beforeEnter: (to, from) => {
        //   const isAuthenticated = false;

        //   if (!isAuthenticated && to.name !== 'spinner') {
        //     return { name: `${subdomain.value}-spinner` };
        //   }
        // },
      }));
      console.log('subdomain route');
      console.log(routeMapped);
      return routeMapped;
    } else {
      console.log('localhost route');
      return _routes;
    }
  },
};
