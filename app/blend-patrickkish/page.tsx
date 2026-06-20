import { BlendPanel } from "./components/BlendPanel";

export default function BlendPatrickKishPage() {
  return (
    <div
      className="flex min-h-full flex-1 flex-col bg-white text-zinc-900"
      style={{ colorScheme: "light" }}
    >
      <BlendPanel />
    </div>
  );
}
