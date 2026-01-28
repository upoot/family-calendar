export interface Member {
  id: number;
  name: string;
  color: string;
  display_order: number;
}

export interface Category {
  id: number;
  name: string;
  icon: string | null;
}

export interface CalendarEvent {
  id: number;
  member_id: number;
  category_id: number | null;
  title: string;
  start_time: string;
  end_time: string;
  date: string | null;
  weekday: number | null;
  location: string | null;
  description: string | null;
  is_recurring: number;
  ride_outbound: string | null;
  ride_return: string | null;
  member_name: string;
  member_color: string;
  category_name: string | null;
  category_icon: string | null;
}

export interface EventFormData {
  member_id: number;
  category_id: number | null;
  title: string;
  start_time: string;
  end_time: string;
  date: string | null;
  weekday: number | null;
  location: string;
  description: string;
  is_recurring: boolean;
  ride_outbound: string;
  ride_return: string;
}
