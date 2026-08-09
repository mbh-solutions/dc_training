import {
  ExerciseScreen,
  ProtocolScreen,
  ReviewScreen,
  SetupScreen,
  StructureScreen,
  type Props,
} from "./RotationSetupView.jsx";
import type { Screen } from "./hooks/use-rotation-flow.js";

function RotationSetupFlow(props: Props & { screen: Screen }) {
  if (props.screen === "setup") return <SetupScreen {...props} />;
  if (props.screen === "exercise") return <ExerciseScreen {...props} />;
  if (props.screen === "protocol") return <ProtocolScreen {...props} />;
  if (props.screen === "structure") return <StructureScreen {...props} />;
  return <ReviewScreen {...props} />;
}

export default RotationSetupFlow;
