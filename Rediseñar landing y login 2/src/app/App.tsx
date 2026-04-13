import { useState } from "react";
import { LandingPage } from "./components/LandingPage";
import { LoginPage } from "./components/LoginPage";

export default function App() {
  const [currentView, setCurrentView] = useState<"landing" | "login">("landing");

  return (
    <div className="size-full">
      {currentView === "landing" ? (
        <LandingPage onNavigateToLogin={() => setCurrentView("login")} />
      ) : (
        <LoginPage onNavigateBack={() => setCurrentView("landing")} />
      )}
    </div>
  );
}