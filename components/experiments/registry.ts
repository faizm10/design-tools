import type { ComponentType } from "react";
import { DropletsDemoExperiment } from "@/components/experiments/droplets-demo";

export type Experiment = {
  name: string;
  description?: string;
  component: ComponentType;
};

export const experiments: Experiment[] = [
  {
    name: "Droplets",
    component: DropletsDemoExperiment,
  },
];
