import { useParams } from "react-router-dom";
import { PrescriptionDetail } from "@/components/prescription/PrescriptionDetail";

export function PrescriptionPage() {
  const { id = "" } = useParams<{ id: string }>();
  return <PrescriptionDetail key={id} id={id} />;
}
