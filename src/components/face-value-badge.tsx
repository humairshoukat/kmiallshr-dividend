import type { Stock } from "@/lib/stocks";

type FaceValueStock = Pick<Stock, "faceValue" | "faceValueSourceUrl" | "faceValueSourceAsOf" | "faceValueSourcePage">;

export function FaceValueBadge({ stock }: { stock: FaceValueStock }) {
  return (
    <a className="face-value-badge"
      href={`${stock.faceValueSourceUrl}#page=${stock.faceValueSourcePage}`}
      title={`Face value: Rs ${stock.faceValue} per share · Official PSX quotation, ${stock.faceValueSourceAsOf}, page ${stock.faceValueSourcePage}`}
      aria-label={`Face value Rs ${stock.faceValue} per share. View PSX source.`}
      target="_blank" rel="noreferrer">
      FV Rs {stock.faceValue}
    </a>
  );
}
