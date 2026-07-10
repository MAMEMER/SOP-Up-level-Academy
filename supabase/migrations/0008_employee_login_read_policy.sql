create policy "users read own login events"
on public.employee_login_events for select
to authenticated
using (user_id = auth.uid());
