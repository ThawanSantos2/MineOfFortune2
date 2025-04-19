// supabase.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export const supabase = createClient(
  'https://lnjiwmjvfwwysvzfoxmx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxuaml3bWp2Znd3eXN2emZveG14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ2ODU4NDksImV4cCI6MjA2MDI2MTg0OX0.AWFyv6BiZorPT7dTG2X1X82LjgcLh9nSu6Zo3_fOHPU'
);

export function gerarCodigo() {
  return Math.random().toString(36).substring(2, 8);
}
