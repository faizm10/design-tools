import { Input } from "@/components/ui/input";

export function ExampleInputExperiment() {
  return (
    <label className="block max-w-sm text-sm">
      <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">
        Example input
      </span>
      <Input placeholder="Type something to test states" />
    </label>
  );
}
