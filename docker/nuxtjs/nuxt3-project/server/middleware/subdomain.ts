export default defineEventHandler((event) => {
    console.log(getRequestURL(event).hostname);
    const req = getRequestURL(event).hostname.split('.').shift();
    const hostname = req;
    console.log('middleware');
    console.log(hostname);
  
    event.context.subdomain = hostname;
  });
  