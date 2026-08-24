import { PriceHikeDashboard } from "@/components/price-hike-dashboard";
import { getStocks } from "@/lib/stocks";

export default function PriceHikesPage() {
  return <PriceHikeDashboard stocks={getStocks()} />;
}
