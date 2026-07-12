import { useMemo } from "react";
import { Camera } from "lucide-react";
import { useTranslation } from "react-i18next";
import { buildCameraPreviewTransform } from "./angleCameraPreview";

export function CameraPreview({
  imageUrl,
  rotation,
  pitch,
  distance,
}: {
  imageUrl: string | null;
  rotation: number;
  pitch: number;
  distance: number;
}) {
  const { t } = useTranslation("studio");
  const transform = useMemo(
    () => buildCameraPreviewTransform(rotation, pitch, distance),
    [rotation, pitch, distance],
  );

  return (
    <div className="studio-tool-camera-preview" data-testid="angle-camera-preview">
      <div className="studio-tool-camera-stage">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="studio-tool-camera-plane"
            style={{ transform }}
            data-testid="angle-camera-image"
          />
        ) : (
          <div className="studio-tool-camera-placeholder" data-testid="angle-camera-placeholder">
            <Camera className="w-8 h-8" strokeWidth={1} />
            <span>{t("studio.dropImage")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
