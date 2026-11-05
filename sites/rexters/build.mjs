import fs from 'node:fs';
// Run from sites/rexters. Wraps public/index.html into a module Worker (dist/rexters.js)
// with the logo inlined as a data URI (no asset routing needed for the preview).
const root = process.cwd();
const html = fs.readFileSync(root + '/public/index.html', 'utf8');
const logo = fs.readFileSync(root + '/public/assets/rexters-logo.jpg', 'utf8');
const uri = 'data:image/jpeg;base64,' + Buffer.from(logo).toString('base64');
const page = html.replaceAll('__LOGO_URI__', uri);
const code = `const HTML = ${JSON.stringify(page)};
export default {
  async fetch(req){
    return new Response(HTML, { headers:{ 'content-type':'text/html; charset=utf-8', 'cache-control':'public, max-age=60' } });
  }
};`;
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync(root + '/dist/rexters.js', code);
console.log('rexters dist bytes=' + code.length);