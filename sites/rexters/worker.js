// Rexter's preview host: the page is a normal asset set, so this worker only
// passes the request through to ASSETS. That lets the site deploy from the same
// pipeline as the four client sites (merge to main), instead of a hand upload
// of a single-file worker that inlined the logo as a data URI.
export default {
  async fetch(req, env) {
    return env.ASSETS.fetch(req);
  },
};
