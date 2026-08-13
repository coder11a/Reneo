import { NavigateFunction } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from './supabase';
import { Product } from '../types';

/** How recently a host must have checked in for its session to count as live. */
export const LIVE_FRESHNESS_MS = 60000;

/**
 * Take a product live. One live session per seller: if the host already has a
 * live session, just add this product to it (and feature it) instead of
 * creating a second session — so customers never see duplicate "Join Live" cards.
 */
export async function goLive(product: Product, hostId: string, navigate: NavigateFunction) {
  if (product.status !== 'active') {
    toast.error('Only active products can go live. Update the status first.');
    return;
  }

  const { data: existing } = await supabase
    .from('live_sessions')
    .select('id')
    .eq('host_id', hostId)
    .eq('status', 'live')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    await supabase.from('live_session_products').upsert({ session_id: existing.id, product_id: product.id });
    await supabase.from('live_sessions').update({ product_id: product.id }).eq('id', existing.id); // feature the newly added product
    navigate(`/live/${existing.id}`);
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
  // Seed the session's product set with this first (featured) product.
  await supabase.from('live_session_products').insert({ session_id: data.id, product_id: product.id });
  toast.success('Going live!');
  navigate(`/live/${data.id}`);
}
