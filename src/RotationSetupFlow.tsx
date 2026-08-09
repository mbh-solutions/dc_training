import {
  ExerciseScreen,
  ProtocolScreen,
  ReviewScreen,
  SetupScreen,
  StructureScreen,
  type Props,
} from "./RotationSetupView.jsx";

export type Screen = "setup" | "exercise" | "protocol" | "structure" | "review";

function RotationSetupFlow(props: Props & { screen: Screen }) {
  if (props.screen === "setup") return <SetupScreen {...props} />;
  if (props.screen === "exercise") return <ExerciseScreen {...props} />;
  if (props.screen === "protocol") return <ProtocolScreen {...props} />;
  if (props.screen === "structure") return <StructureScreen {...props} />;
  return <ReviewScreen {...props} />;
}

export default RotationSetupFlow;
