import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oabzwnivfpmjrpzjyrez.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYnp3bml2ZnBtanJwemp5cmV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2OTk2NjIsImV4cCI6MjA4NTI3NTY2Mn0.qzJTIJ4L0xjWMez7Krf8SSurBkBd4kKeCestgpU0zjY';

// Using 'any' for now until tables are created and types generated
// After running the schema.sql, you can generate proper types with:
// npx supabase gen types typescript --project-id oabzwnivfpmjrpzjyrez > src/database.types.ts
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
