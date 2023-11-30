export const useSubdomain = () =>
  useState<string>('subdomain', () => {
    console.log('useSubdomain');
    null;
  });
