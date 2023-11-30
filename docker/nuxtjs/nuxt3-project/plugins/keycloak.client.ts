import Keycloak, { KeycloakConfig } from 'keycloak-js';
import { useKeycloakStore } from '../stores/keycloakStore';

// const subDomain = window.location.host.split('.').shift();

export default defineNuxtPlugin((nuxtApp) => {
  const runtimeConfig = useRuntimeConfig();
  const state = useKeycloakStore();
  const subDomain = useRequestURL().host.split('.').shift();

  const initOptions: KeycloakConfig = {
    url: runtimeConfig.public.authUrl,
    realm: `${subDomain}-auth`,
    clientId: `${subDomain}-webapp`,
  };

  console.log(initOptions);
  const keycloak = new Keycloak(initOptions);
  nuxtApp.$keycloak = keycloak;
  keycloak
    .init({
      // No need for the router guards in router.js with 'login-required' option.
      onLoad: 'login-required',
    })
    .catch((e) => {
      console.dir(e);
      console.log(`keycloak init exception: ${e}`);
    });
});
