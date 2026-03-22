'use client';

import { useState } from 'react';
import { Calendar as CalIcon, Plus, Clock, User, MapPin, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { appointments } from '@/data/appointments';
import Modal from '@/components/Modal';

const statusColors = {
  Scheduled: 'bg-info-light text-info',
  Completed: 'bg-success-light text-success',
  Cancelled: 'bg-danger-light text-danger',
};

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function AppointmentsPage() {
  const [currentMonth, setCurrentMonth] = useState(2); // March (0-indexed)
  const [currentYear, setCurrentYear] = useState(2026);
  const [selectedDate, setSelectedDate] = useState('2026-03-14');
  const [showBookModal, setShowBookModal] = useState(false);

  const getDaysInMonth = (month, year) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (month, year) => new Date(year, month, 1).getDay();

  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDay = getFirstDayOfMonth(currentMonth, currentYear);

  const calendarDays = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);

  const getDateStr = (day) => {
    if (!day) return '';
    return `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const getAppointmentsForDate = (dateStr) => appointments.filter(a => a.date === dateStr);
  const selectedAppointments = getAppointmentsForDate(selectedDate);

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  };

  return (
    <div className="space-y-6 animate-[fade-in_0.5s_ease-out]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Appointments</h1>
          <p className="text-sm text-muted mt-1">{appointments.filter(a => a.status === 'Scheduled').length} upcoming · {appointments.filter(a => a.status === 'Completed').length} completed</p>
        </div>
        <button onClick={() => setShowBookModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all">
          <Plus className="w-4 h-4" /> Book Appointment
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Calendar */}
        <div className="lg:col-span-2 glass-card p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-foreground">{months[currentMonth]} {currentYear}</h2>
            <div className="flex gap-1">
              <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-surface-hover text-muted hover:text-foreground transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-surface-hover text-muted hover:text-foreground transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {days.map(d => (
              <div key={d} className="text-center text-xs font-semibold text-muted py-2">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, i) => {
              const dateStr = getDateStr(day);
              const dayAppts = day ? getAppointmentsForDate(dateStr) : [];
              const isSelected = dateStr === selectedDate;
              const isToday = dateStr === '2026-03-14';

              return (
                <button
                  key={i}
                  onClick={() => day && setSelectedDate(dateStr)}
                  disabled={!day}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 text-sm transition-all relative ${
                    !day ? '' :
                    isSelected ? 'bg-accent text-white font-bold' :
                    isToday ? 'bg-accent/10 text-accent font-semibold ring-1 ring-accent/30' :
                    'text-foreground hover:bg-surface-hover'
                  }`}
                >
                  {day && (
                    <>
                      <span>{day}</span>
                      {dayAppts.length > 0 && (
                        <div className="flex gap-0.5">
                          {dayAppts.slice(0, 3).map((_, j) => (
                            <div key={j} className={`w-1 h-1 rounded-full ${isSelected ? 'bg-black/50' : 'bg-accent'}`} />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Appointments for selected date */}
        <div className="glass-card p-5">
          <h2 className="text-base font-semibold text-foreground mb-1">
            {selectedDate ? new Date(selectedDate + 'T00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Select a date'}
          </h2>
          <p className="text-xs text-muted mb-4">{selectedAppointments.length} appointment{selectedAppointments.length !== 1 ? 's' : ''}</p>

          {selectedAppointments.length > 0 ? (
            <div className="space-y-3">
              {selectedAppointments.map(apt => (
                <div key={apt.id} className="p-4 rounded-xl bg-surface hover:bg-surface-hover transition-colors border border-border">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-accent" />
                      <span className="text-sm font-semibold text-foreground">{apt.time}</span>
                    </div>
                    <span className={`badge text-[10px] ${statusColors[apt.status]}`}>{apt.status}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-3.5 h-3.5 text-muted" />
                    <span className="text-sm text-foreground">{apt.customer}</span>
                  </div>
                  <p className="text-xs text-accent mb-1">{apt.purpose}</p>
                  <p className="text-xs text-muted">{apt.notes}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted">
              <CalIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No appointments on this date</p>
            </div>
          )}
        </div>
      </div>

      {/* All Appointments Table */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">All Appointments</h2>
        </div>
        <table className="crm-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Date</th>
              <th>Time</th>
              <th>Purpose</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map(apt => (
              <tr key={apt.id}>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-teal-light flex items-center justify-center text-xs font-semibold text-teal">
                      {apt.customer.split(' ').map(n => n[0]).join('')}
                    </div>
                    <span className="font-medium text-foreground">{apt.customer}</span>
                  </div>
                </td>
                <td>{apt.date}</td>
                <td className="text-foreground font-medium">{apt.time}</td>
                <td>{apt.purpose}</td>
                <td><span className={`badge ${statusColors[apt.status]}`}>{apt.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Book Appointment Modal */}
      <Modal isOpen={showBookModal} onClose={() => setShowBookModal(false)} title="Book Appointment">
        <form className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Customer Name</label>
            <input type="text" placeholder="Customer name" className="w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Phone</label>
            <input type="tel" placeholder="+91..." className="w-full" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Date</label>
              <input type="date" className="w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Time</label>
              <input type="time" className="w-full" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Purpose</label>
            <select className="w-full">
              <option>Sofa Collection Viewing</option>
              <option>Bed Selection</option>
              <option>Dining Table Measurement</option>
              <option>Kitchen Design Consultation</option>
              <option>Wardrobe Design Discussion</option>
              <option>General Showroom Visit</option>
              <option>Order Pickup</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Notes</label>
            <textarea rows={3} placeholder="Additional notes..." className="w-full" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowBookModal(false)} className="px-4 py-2.5 rounded-xl text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-colors">Cancel</button>
            <button type="submit" className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all">Book Appointment</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
