"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function ExampleModalExperiment() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-24 items-center">
      <Button onClick={() => setOpen(true)} variant="secondary">
        Open modal
      </Button>
      <Modal
        open={open}
        title="Example modal"
        onClose={() => setOpen(false)}
      >
        This is a minimal modal placeholder. Replace it later with Radix,
        shadcn/ui, Motion, or another interaction library when you want richer
        behavior.
      </Modal>
    </div>
  );
}
