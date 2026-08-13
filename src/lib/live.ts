import { NavigateFunction } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from './supabase';
import { Product } from '../types';

/** How recently a host must have checked in for its session to count as live. */
export const LIVE_FRESHNESS_MS = 30000;

/** Create a live session for a product and navigate the host into it. */
export async function goLive(product: Product, hostId: string, navigate: NavigateFunction) {
  if (product.status !== 'active') {
    toast.error('Only active products can go live. Update the status first.');
    return;
  }
  const channelName = `live-${crypto.randomUUID()}`;
  const { data, error } = await supabase
    .from('live_sessions')
    .insert({ host_id: hostId, product_id: product.id, status: 'live', channel_name: channelName })
    .select()
    .single();

  if (error) {
    toast.error('Failed to go live: ' + error.message);
    return;
  }
  toast.success('Going live!');
  navigate(`/live/${data.id}`);
}
