import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #fde68a 0%, #fda4af 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 120,
          lineHeight: 1,
        }}
      >
        💞
      </div>
    ),
    { ...size }
  );
}
