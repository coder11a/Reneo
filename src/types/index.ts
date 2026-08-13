export type UserRole = 'seller' | 'customer';

export interface Profile {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
}

export interface Product {
  id: string;
  seller_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  stock: number;
  status: 'draft' | 'active' | 'archived';
  created_at: string;
}

export type LiveSessionStatus = 'scheduled' | 'live' | 'ended';

export interface LiveSession {
  id: string;
  host_id: string;
  product_id: string;
  status: LiveSessionStatus;
  channel_name: string;
  viewer_count: number;
  created_at: string;
  ended_at: string | null;
  last_seen_at: string;
  // Joined fields
  product?: Product;
  host?: Profile;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  sender_id: string;
  sender_name: string;
  message: string;
  created_at: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}
