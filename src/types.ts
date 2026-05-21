export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  status: 'In Stock' | 'Low Stock' | 'Out of Stock';
  location: string;
  lastUpdated: string;
}

export interface RackLocation {
  id: string;
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  capacity: number;
  filled: number;
}

export interface InventoryStats {
  totalItems: number;
  totalValue: number;
  lowStockItems: number;
  outOfStockItems: number;
}
