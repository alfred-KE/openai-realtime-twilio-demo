import React from "react";
import { ThemeToggle } from "./theme-toggle";

const TopBar = () => {
  return (
    <div className="flex justify-between items-center px-6 py-4 border-b bg-background">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold">Voice Assistant</h1>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </div>
  );
};

export default TopBar;
