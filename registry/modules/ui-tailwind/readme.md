[Tailwind CSS](https://tailwindcss.com) v4 — utility-first styling with the new Vite/PostCSS pipeline. No `tailwind.config.{js,ts}`; theme tokens live in `@theme` blocks inside your CSS.

Global stylesheet is at `{{app.dir}}/app/globals.css` (Next.js) or `{{app.dir}}/src/globals.css` (TanStack Start). Import it from your root layout/route and start using classes:

```tsx
<button className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-500">Click me</button>
```
