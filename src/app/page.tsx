import { DividendDashboard } from "@/components/dividend-dashboard";
import { getStocks } from "@/lib/stocks";

export default function Home() {
  return <DividendDashboard stocks={getStocks()} />;
}
