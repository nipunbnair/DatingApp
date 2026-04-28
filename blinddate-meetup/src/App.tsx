/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  onSnapshot,
  Timestamp,
  getDocs
} from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import { 
  MapPin, 
  Calendar, 
  User as UserIcon, 
  Heart, 
  Coffee, 
  Car, 
  Bus, 
  DollarSign, 
  Loader2,
  LogOut,
  ChevronRight,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, addDays, setHours, setMinutes } from 'date-fns';
import { cn } from './lib/utils';

// --- Types ---
interface UserProfile {
  uid: string;
  name: string;
  sex: 'male' | 'female' | 'other';
  preference: 'male' | 'female' | 'everyone';
  eatingPreferences: string;
  travelingMeans: 'car' | 'public transport';
  budget: number;
  location: {
    latitude: number;
    longitude: number;
  };
  status: 'searching' | 'matched' | 'idle';
  lastUpdated: Timestamp;
}

interface Meetup {
  id: string;
  venueName: string;
  venueAddress: string;
  scheduledTime: Timestamp;
  participantIds: string[];
  budgetTier: number;
  location: {
    latitude: number;
    longitude: number;
  };
}

// --- Constants ---
const BUDGET_LEVELS = [
  { value: 20, label: '$ (Budget)', icon: '☕' },
  { value: 50, label: '$$ (Standard)', icon: '🍝' },
  { value: 100, label: '$$$ (Premium)', icon: '🍷' },
  { value: 200, label: '$$$$ (Luxury)', icon: '💎' },
];

const VENUES = [
  { name: "The Cozy Corner", address: "123 Espresso Lane", type: "Cafe" },
  { name: "Skyline Bistro", address: "456 Vista Way", type: "Restaurant" },
  { name: "Garden Terrace", address: "789 Bloom St", type: "Cafe" },
  { name: "Urban Grill", address: "101 Metro Blvd", type: "Restaurant" },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [meetup, setMeetup] = useState<Meetup | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<UserProfile>>({
    sex: 'male',
    preference: 'everyone',
    travelingMeans: 'public transport',
    budget: 50,
    eatingPreferences: '',
  });

  // --- Auth & Profile Loading ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await fetchProfile(currentUser.uid);
      } else {
        setProfile(null);
        setMeetup(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const fetchProfile = async (uid: string) => {
    try {
      const docRef = doc(db, 'users', uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfile;
        setProfile(data);
        if (data.status === 'matched') {
          fetchMeetup(uid);
        }
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
      setError("Failed to load profile.");
    }
  };

  const fetchMeetup = (uid: string) => {
    const q = query(
      collection(db, 'meetups'),
      where('participantIds', 'array-contains', uid)
    );
    return onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data() as Meetup;
        setMeetup({ ...data, id: snapshot.docs[0].id });
      } else {
        setMeetup(null);
      }
    });
  };

  // --- Actions ---
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Login failed:", err);
      setError("Login failed. Please try again.");
    }
  };

  const handleLogout = () => signOut(auth);

  const handleOnboardingSubmit = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Get Location
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });

      const newProfile: UserProfile = {
        uid: user.uid,
        name: user.displayName || 'Anonymous',
        sex: formData.sex as any,
        preference: formData.preference as any,
        eatingPreferences: formData.eatingPreferences || '',
        travelingMeans: formData.travelingMeans as any,
        budget: formData.budget || 50,
        location: {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        },
        status: 'searching',
        lastUpdated: Timestamp.now(),
      };

      await setDoc(doc(db, 'users', user.uid), newProfile);
      setProfile(newProfile);
      
      // Trigger matching logic (simulated)
      simulateMatching(newProfile);
    } catch (err) {
      console.error("Onboarding failed:", err);
      setError("Failed to save profile. Make sure location access is enabled.");
    } finally {
      setLoading(false);
    }
  };

  const simulateMatching = async (userProfile: UserProfile) => {
    // In a real app, this would be a server-side function.
    // Here we simulate finding a group after a short delay.
    setTimeout(async () => {
      try {
        // Find other "searching" users (simplified)
        const q = query(
          collection(db, 'users'),
          where('status', '==', 'searching'),
          where('budget', '==', userProfile.budget)
        );
        const snapshot = await getDocs(q);
        const candidates = snapshot.docs
          .map(d => d.data() as UserProfile)
          .filter(p => p.uid !== userProfile.uid);

        if (candidates.length >= 2) {
          // Create a meetup for the first 3 users
          const participants = [userProfile.uid, ...candidates.slice(0, 2).map(c => c.uid)];
          const venue = VENUES[Math.floor(Math.random() * VENUES.length)];
          
          const meetupId = `meetup_${Date.now()}`;
          const scheduledTime = addDays(setHours(setMinutes(new Date(), 0), 19), 2); // 7 PM, 2 days from now

          const newMeetup: Meetup = {
            id: meetupId,
            venueName: venue.name,
            venueAddress: venue.address,
            scheduledTime: Timestamp.fromDate(scheduledTime),
            participantIds: participants,
            budgetTier: userProfile.budget,
            location: userProfile.location,
          };

          await setDoc(doc(db, 'meetups', meetupId), newMeetup);
          
          // Update all participants' status
          for (const uid of participants) {
            await setDoc(doc(db, 'users', uid), { status: 'matched' }, { merge: true });
          }
          
          setProfile(prev => prev ? { ...prev, status: 'matched' } : null);
          setMeetup(newMeetup);
        }
      } catch (err) {
        console.error("Matching simulation failed:", err);
      }
    }, 5000);
  };

  // --- Render Helpers ---
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-stone-50">
        <Loader2 className="w-12 h-12 animate-spin text-rose-500" />
        <p className="mt-4 text-stone-600 font-medium">Initializing BlindDate...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-stone-50 p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 bg-rose-100 rounded-3xl mb-4">
            <Heart className="w-10 h-10 text-rose-500 fill-rose-500" />
          </div>
          <h1 className="text-4xl font-bold text-stone-900 tracking-tight">BlindDate Meetup</h1>
          <p className="text-lg text-stone-600">
            Meet real people in real life. No swiping, no profiles, just group dates at local cafes.
          </p>
          <button
            onClick={handleLogin}
            className="w-full py-4 px-6 bg-stone-900 text-white rounded-2xl font-semibold hover:bg-stone-800 transition-all flex items-center justify-center gap-3 shadow-xl shadow-stone-200"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
            Continue with Google
          </button>
          <p className="text-xs text-stone-400 uppercase tracking-widest font-bold">
            Secure • Anonymous • Real Life
          </p>
        </motion.div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-stone-50 p-6 flex flex-col items-center">
        <div className="max-w-md w-full space-y-8">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-stone-900">Setup Your Profile</h2>
            <span className="text-sm font-medium text-stone-400">Step {onboardingStep + 1} of 5</span>
          </div>

          <AnimatePresence mode="wait">
            {onboardingStep === 0 && (
              <motion.div 
                key="step0"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: -20 }}
                className="space-y-6"
              >
                <p className="text-stone-600">Tell us about yourself.</p>
                <div className="grid grid-cols-3 gap-3">
                  {['male', 'female', 'other'].map((s) => (
                    <button
                      key={s}
                      onClick={() => setFormData({ ...formData, sex: s as any })}
                      className={cn(
                        "py-4 rounded-2xl border-2 transition-all capitalize font-medium",
                        formData.sex === s ? "border-rose-500 bg-rose-50 text-rose-600" : "border-stone-200 bg-white text-stone-600"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <button 
                  onClick={() => setOnboardingStep(1)}
                  className="w-full py-4 bg-stone-900 text-white rounded-2xl font-semibold flex items-center justify-center gap-2"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </motion.div>
            )}

            {onboardingStep === 1 && (
              <motion.div 
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: -20 }}
                className="space-y-6"
              >
                <p className="text-stone-600">Who would you like to meet?</p>
                <div className="grid grid-cols-1 gap-3">
                  {['male', 'female', 'everyone'].map((p) => (
                    <button
                      key={p}
                      onClick={() => setFormData({ ...formData, preference: p as any })}
                      className={cn(
                        "py-4 px-6 rounded-2xl border-2 text-left transition-all capitalize font-medium flex justify-between items-center",
                        formData.preference === p ? "border-rose-500 bg-rose-50 text-rose-600" : "border-stone-200 bg-white text-stone-600"
                      )}
                    >
                      {p}
                      {formData.preference === p && <CheckCircle2 className="w-5 h-5" />}
                    </button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setOnboardingStep(0)} className="flex-1 py-4 border-2 border-stone-200 rounded-2xl font-medium">Back</button>
                  <button onClick={() => setOnboardingStep(2)} className="flex-[2] py-4 bg-stone-900 text-white rounded-2xl font-semibold">Next</button>
                </div>
              </motion.div>
            )}

            {onboardingStep === 2 && (
              <motion.div 
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: -20 }}
                className="space-y-6"
              >
                <p className="text-stone-600">What's your typical date budget?</p>
                <div className="grid grid-cols-1 gap-3">
                  {BUDGET_LEVELS.map((b) => (
                    <button
                      key={b.value}
                      onClick={() => setFormData({ ...formData, budget: b.value })}
                      className={cn(
                        "py-4 px-6 rounded-2xl border-2 text-left transition-all font-medium flex items-center gap-4",
                        formData.budget === b.value ? "border-rose-500 bg-rose-50 text-rose-600" : "border-stone-200 bg-white text-stone-600"
                      )}
                    >
                      <span className="text-2xl">{b.icon}</span>
                      <div className="flex flex-col">
                        <span>{b.label}</span>
                        <span className="text-xs opacity-60">Up to ${b.value}</span>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setOnboardingStep(1)} className="flex-1 py-4 border-2 border-stone-200 rounded-2xl font-medium">Back</button>
                  <button onClick={() => setOnboardingStep(3)} className="flex-[2] py-4 bg-stone-900 text-white rounded-2xl font-semibold">Next</button>
                </div>
              </motion.div>
            )}

            {onboardingStep === 3 && (
              <motion.div 
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: -20 }}
                className="space-y-6"
              >
                <p className="text-stone-600">How do you usually travel?</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setFormData({ ...formData, travelingMeans: 'car' })}
                    className={cn(
                      "py-8 rounded-2xl border-2 transition-all font-medium flex flex-col items-center gap-3",
                      formData.travelingMeans === 'car' ? "border-rose-500 bg-rose-50 text-rose-600" : "border-stone-200 bg-white text-stone-600"
                    )}
                  >
                    <Car className="w-8 h-8" />
                    Car
                  </button>
                  <button
                    onClick={() => setFormData({ ...formData, travelingMeans: 'public transport' })}
                    className={cn(
                      "py-8 rounded-2xl border-2 transition-all font-medium flex flex-col items-center gap-3",
                      formData.travelingMeans === 'public transport' ? "border-rose-500 bg-rose-50 text-rose-600" : "border-stone-200 bg-white text-stone-600"
                    )}
                  >
                    <Bus className="w-8 h-8" />
                    Public Transport
                  </button>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setOnboardingStep(2)} className="flex-1 py-4 border-2 border-stone-200 rounded-2xl font-medium">Back</button>
                  <button onClick={() => setOnboardingStep(4)} className="flex-[2] py-4 bg-stone-900 text-white rounded-2xl font-semibold">Next</button>
                </div>
              </motion.div>
            )}

            {onboardingStep === 4 && (
              <motion.div 
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: -20 }}
                className="space-y-6"
              >
                <p className="text-stone-600">Any dietary preferences or allergies?</p>
                <textarea
                  value={formData.eatingPreferences}
                  onChange={(e) => setFormData({ ...formData, eatingPreferences: e.target.value })}
                  placeholder="e.g. Vegetarian, Nut Allergy, Love Italian..."
                  className="w-full p-4 rounded-2xl border-2 border-stone-200 bg-white min-h-[120px] focus:border-rose-500 outline-none transition-all"
                />
                <div className="bg-amber-50 p-4 rounded-xl flex gap-3 items-start">
                  <MapPin className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">
                    We'll request your location next to find meetups near you.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setOnboardingStep(3)} className="flex-1 py-4 border-2 border-stone-200 rounded-2xl font-medium">Back</button>
                  <button 
                    onClick={handleOnboardingSubmit} 
                    disabled={loading}
                    className="flex-[2] py-4 bg-rose-500 text-white rounded-2xl font-semibold hover:bg-rose-600 transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Complete Setup"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Heart className="w-6 h-6 text-rose-500 fill-rose-500" />
          <h1 className="text-xl font-bold text-stone-900">BlindDate</h1>
        </div>
        <button 
          onClick={handleLogout}
          className="p-2 text-stone-400 hover:text-stone-600 transition-colors"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      <main className="p-6 max-w-md mx-auto space-y-6">
        {/* Status Card */}
        <section className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-stone-900">Your Status</h2>
            <span className={cn(
              "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
              profile.status === 'searching' ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
            )}>
              {profile.status}
            </span>
          </div>

          {profile.status === 'searching' ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-stone-50 rounded-2xl">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                  <Loader2 className="w-6 h-6 animate-spin text-rose-500" />
                </div>
                <div>
                  <p className="font-semibold text-stone-900">Finding a Group</p>
                  <p className="text-sm text-stone-500">Matching with users nearby...</p>
                </div>
              </div>
              <p className="text-sm text-stone-500 italic">
                "We're clustering users based on your ${profile.budget} budget and location. You'll be notified once a group is formed!"
              </p>
            </div>
          ) : meetup ? (
            <div className="space-y-6">
              <div className="flex items-center gap-4 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm text-emerald-500">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-semibold text-emerald-900">Match Found!</p>
                  <p className="text-sm text-emerald-700">A group date has been scheduled.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-stone-100 rounded-lg flex items-center justify-center shrink-0">
                    <Coffee className="w-5 h-5 text-stone-600" />
                  </div>
                  <div>
                    <p className="text-xs text-stone-400 font-bold uppercase tracking-wider">Venue</p>
                    <p className="font-bold text-stone-900">{meetup.venueName}</p>
                    <p className="text-sm text-stone-500">{meetup.venueAddress}</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-stone-100 rounded-lg flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5 text-stone-600" />
                  </div>
                  <div>
                    <p className="text-xs text-stone-400 font-bold uppercase tracking-wider">Time</p>
                    <p className="font-bold text-stone-900">
                      {format(meetup.scheduledTime.toDate(), 'EEEE, MMM do')}
                    </p>
                    <p className="text-sm text-stone-500">
                      {format(meetup.scheduledTime.toDate(), 'h:mm a')}
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-stone-100 rounded-lg flex items-center justify-center shrink-0">
                    <UserIcon className="w-5 h-5 text-stone-600" />
                  </div>
                  <div>
                    <p className="text-xs text-stone-400 font-bold uppercase tracking-wider">Group Size</p>
                    <p className="font-bold text-stone-900">{meetup.participantIds.length} People</p>
                    <p className="text-sm text-stone-500">Blind group meetup</p>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button className="w-full py-4 bg-stone-900 text-white rounded-2xl font-semibold flex items-center justify-center gap-2">
                  <MapPin className="w-4 h-4" /> Open in Maps
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-stone-500">Something went wrong. Try refreshing.</p>
            </div>
          )}
        </section>

        {/* Profile Summary */}
        <section className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100">
          <h2 className="text-lg font-bold text-stone-900 mb-4">Your Preferences</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 bg-stone-50 rounded-2xl">
              <DollarSign className="w-4 h-4 text-stone-400 mb-2" />
              <p className="text-xs text-stone-400 font-bold uppercase">Budget</p>
              <p className="font-bold text-stone-900">${profile.budget}</p>
            </div>
            <div className="p-4 bg-stone-50 rounded-2xl">
              {profile.travelingMeans === 'car' ? <Car className="w-4 h-4 text-stone-400 mb-2" /> : <Bus className="w-4 h-4 text-stone-400 mb-2" />}
              <p className="text-xs text-stone-400 font-bold uppercase">Travel</p>
              <p className="font-bold text-stone-900 capitalize">{profile.travelingMeans}</p>
            </div>
          </div>
        </section>

        <p className="text-center text-xs text-stone-400 px-8">
          Meetups are scheduled based on the collective availability of the group. You'll receive an email notification for any changes.
        </p>
      </main>
    </div>
  );
}
