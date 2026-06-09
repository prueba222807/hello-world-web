import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hola Mundo" },
      { name: "description", content: "Una web sencilla que dice hola mundo." },
      { property: "og:title", content: "Hola Mundo" },
      { property: "og:description", content: "Una web sencilla que dice hola mundo." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <h1 className="text-5xl font-bold tracking-tight text-foreground">
        Hola Mundo
      </h1>
    </div>
  );
}
