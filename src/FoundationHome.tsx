import { useState } from "react";
import HomeScreen from "./HomeScreen.jsx";
import RotationSetup from "./RotationSetup.jsx";

export type FoundationHomeProps = {
  cloudStatus: string;
  email?: string;
  online: boolean;
  onSignOut: () => Promise<void>;
  syncState: "idle" | "syncing" | "synced";
  userId: string;
};

function FoundationHome({ userId, ...homeProps }: FoundationHomeProps) {
  const [showRotationSetup, setShowRotationSetup] = useState(false);

  if (showRotationSetup) {
    return (
      <RotationSetup
        onBack={() => setShowRotationSetup(false)}
        userId={userId}
      />
    );
  }

  return (
    <HomeScreen
      {...homeProps}
      onOpenRotation={() => setShowRotationSetup(true)}
    />
  );
}

export default FoundationHome;
