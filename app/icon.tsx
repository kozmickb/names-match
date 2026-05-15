import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
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
          fontSize: 360,
          lineHeight: 1,
        }}
      >
        💞
      </div>
    ),
    { ...size }
  );
}
