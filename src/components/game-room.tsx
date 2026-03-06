'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, Play, Users, Timer, Trophy, ArrowLeft, Zap, Sparkles, AlertTriangle, Edit2 } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";

interface GameRoomProps {
    code: string;
}

export default function GameRoom({ code }: GameRoomProps) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const isHostInitial = searchParams.get('host') === 'true';

    const [room, setRoom] = useState<any>(null);
    const [player, setPlayer] = useState<any>(null);
    const [players, setPlayers] = useState<any[]>([]);
    const [teams, setTeams] = useState<any[]>([]);
    const [nickname, setNickname] = useState('');
    const [isJoining, setIsJoining] = useState(false);
    const [categories, setCategories] = useState<any[]>([]);
    const [votes, setVotes] = useState<any[]>([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
    const [tiebreakerCategoryIds, setTiebreakerCategoryIds] = useState<string[]>([]);

    // Game State
    const [phase, setPhase] = useState<'joining' | 'lobby' | 'voting' | 'countdown_performer' | 'countdown_ready' | 'performing' | 'celebration' | 'results'>('joining');
    const [countdown, setCountdown] = useState<number>(0);
    const [performer1, setPerformer1] = useState<any>(null);
    const [performer2, setPerformer2] = useState<any>(null);
    const [currentWord, setCurrentWord] = useState<string | null>(null);
    const [winnerTeam, setWinnerTeam] = useState<number | null>(null);
    const [lastScoringTeam, setLastScoringTeam] = useState<number | null>(null);
    const [showWord, setShowWord] = useState(true);
    const [winnerModal, setWinnerModal] = useState<{ name: string, type: 'category' | 'tiebreaker' } | null>(null);
    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
    const [customWordInput, setCustomWordInput] = useState('');
    const [activeCustomWord, setActiveCustomWord] = useState<string | null>(null);
    const [customVotes, setCustomVotes] = useState<any[]>([]);
    const [performingTimer, setPerformingTimer] = useState<number>(45);
    const [celebrationTimer, setCelebrationTimer] = useState<number>(5);
    const [scoreButtonDisabled, setScoreButtonDisabled] = useState<boolean>(false);

    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const performingTimerRef = useRef<NodeJS.Timeout | null>(null);
    const celebrationTimerRef = useRef<NodeJS.Timeout | null>(null);
    const celebrationIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const celebrationStartedRef = useRef<boolean>(false);

    // Fetch initial data
    useEffect(() => {
        const fetchData = async () => {
            const { data: roomData, error: roomError } = await supabase
                .from('rooms')
                .select('*')
                .eq('code', code)
                .single();

            if (roomError) {
                toast.error('Sala no encontrada');
                router.push('/');
                return;
            }
            setRoom(roomData);
            setPhase(roomData.status as any);

            const { data: teamData } = await supabase
                .from('teams')
                .select('*')
                .eq('room_id', roomData.id)
                .order('team_number', { ascending: true });
            setTeams(teamData || []);

            const { data: playerData } = await supabase
                .from('players')
                .select('*')
                .eq('room_id', roomData.id);
            setPlayers(playerData || []);

            const { data: categoryData } = await supabase
                .from('categories')
                .select('*');
            setCategories(categoryData || []);

            // Check if player exists in localStorage
            const savedPlayerId = localStorage.getItem(`player_${code}`);
            if (savedPlayerId) {
                const { data: existingPlayer } = await supabase
                    .from('players')
                    .select('*')
                    .eq('id', savedPlayerId)
                    .single();
                if (existingPlayer) {
                    setPlayer(existingPlayer);
                }
            }
        };

        fetchData();

        // Realtime Subscriptions
        const channel = supabase.channel(`room:${code}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `code=eq.${code}` }, (payload: any) => {
                setRoom(payload.new);
                setPhase(payload.new.status);
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${room?.id}` }, (payload: any) => {
                if (payload.eventType === 'INSERT') {
                    setPlayers(prev => [...prev, payload.new]);
                } else if (payload.eventType === 'UPDATE') {
                    setPlayers(prev => prev.map(p => p.id === payload.new.id ? payload.new : p));
                    // If the updated player is the current user, update the state
                    if (player && payload.new.id === player.id) setPlayer(payload.new);
                }
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `room_id=eq.${room?.id}` }, (payload: any) => {
                setTeams(prev => prev.map(t => t.id === payload.new.id ? payload.new : t).sort((a, b) => a.team_number - b.team_number));
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes', filter: `room_id=eq.${room?.id}` }, (payload: any) => {
                setVotes(prev => [...prev, payload.new]);
            })
            .on('broadcast', { event: 'game_event' }, ({ payload }) => {
                if (payload.type === 'countdown') setCountdown(payload.value);
                if (payload.type === 'performing_timer') setPerformingTimer(payload.value);
                if (payload.type === 'celebration_timer') setCelebrationTimer(payload.value);
                if (payload.type === 'stop_performing_timer') {
                    if (performingTimerRef.current) {
                        clearInterval(performingTimerRef.current);
                        performingTimerRef.current = null;
                    }
                }
                if (payload.type === 'advance_round') {
                    // Host receives signal to advance round
                    console.log('Received advance_round signal, is host:', player?.is_host);
                    if (player?.is_host) {
                        console.log('Host executing runRound from broadcast');
                        // Small delay to ensure celebration phase is set
                        setTimeout(() => {
                            runRound();
                        }, 100);
                    }
                }
                if (payload.type === 'score_button_state') setScoreButtonDisabled(payload.disabled);
                if (payload.type === 'celebration') {
                    setLastScoringTeam(payload.team);
                    // Ensure all clients see celebration
                    if (!player?.is_host) {
                        setPhase('celebration');
                    }
                }
                if (payload.type === 'tiebreaker') {
                    setTiebreakerCategoryIds(payload.categoryIds);
                    setSelectedCategoryId(null);
                    setVotes([]);
                    setWinnerModal({ name: '¡EMPATE!', type: 'tiebreaker' });
                    setTimeout(() => setWinnerModal(null), 3000);
                }
                if (payload.type === 'performers') {
                    setPerformer1(payload.p1);
                    setPerformer2(payload.p2);
                }
                if (payload.type === 'word') setCurrentWord(payload.word);
                if (payload.type === 'custom_word') setActiveCustomWord(payload.word);
                if (payload.type === 'custom_vote') setCustomVotes(prev => [...prev, payload]);
                if (payload.type === 'winner') setWinnerTeam(payload.team);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            if (timerRef.current) clearInterval(timerRef.current);
            if (performingTimerRef.current) clearInterval(performingTimerRef.current);
            if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
            if (celebrationIntervalRef.current) clearInterval(celebrationIntervalRef.current);
        };
    }, [code, room?.id, player?.id, router]);

    // Host-only effect to trigger phase transitions when a point is scored
    const prevRoundRef = useRef<number>(1);
    useEffect(() => {
        if (player?.is_host && room) {
            if (room.status !== 'lobby' && room.status !== 'joining' && room.status !== 'results' && room.status !== 'celebration' && room.current_round > prevRoundRef.current) {
                prevRoundRef.current = room.current_round;
                runRound();
            }
        }
    }, [room?.current_round, player?.is_host]);

    // Deterministic calculation of performers for ALL clients when round/status changes
    useEffect(() => {
        if (!room || players.length === 0 || teams.length < 2) return;

        if (['countdown_performer', 'countdown_ready', 'performing'].includes(phase)) {
            const t1p = players.filter(p => p.team_id === teams[0].id).sort((a, b) => a.id.localeCompare(b.id));
            const t2p = players.filter(p => p.team_id === teams[1].id).sort((a, b) => a.id.localeCompare(b.id));

            if (t1p.length > 0 && t2p.length > 0) {
                const seedBase = `${code}-${room.current_round}`;
                const p1 = t1p[getDeterministicIndex(seedBase + "-p1", t1p.length)];
                const p2 = t2p[getDeterministicIndex(seedBase + "-p2", t2p.length)];
                setPerformer1(p1);
                setPerformer2(p2);
            }
        }
    }, [phase, room?.current_round, players.length, teams.length]);

    // Word visibility timer
    useEffect(() => {
        if (phase === 'performing') {
            setShowWord(true);
            const timer = setTimeout(() => {
                setShowWord(false);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [phase]);

    // Reset score button when entering performing phase or round changes
    useEffect(() => {
        if (phase === 'performing') {
            setScoreButtonDisabled(false);
        } else {
            // Disable button when not in performing phase to prevent accidental clicks during transitions
            setScoreButtonDisabled(true);
        }
    }, [phase, room?.current_round]);

    // Auto-advance from celebration to next round
    useEffect(() => {
        if (phase === 'celebration' && room?.id && !celebrationStartedRef.current) {
            celebrationStartedRef.current = true;
            
            // Clear any existing timers
            if (celebrationIntervalRef.current) {
                clearInterval(celebrationIntervalRef.current);
            }
            
            console.log('Starting celebration timer, is host:', player?.is_host);
            const roomId = room.id;
            const currentRound = room.current_round;
            const isHost = player?.is_host;
            
            // All clients show the countdown
            setCelebrationTimer(5);
            if (isHost) {
                broadcastEvent('celebration_timer', { value: 5 });
            }
            
            let timeLeft = 5;
            celebrationIntervalRef.current = setInterval(() => {
                timeLeft--;
                console.log('Celebration timer:', timeLeft);
                setCelebrationTimer(timeLeft);
                
                if (isHost) {
                    broadcastEvent('celebration_timer', { value: timeLeft });
                }
                
                if (timeLeft <= 0) {
                    if (celebrationIntervalRef.current) {
                        clearInterval(celebrationIntervalRef.current);
                        celebrationIntervalRef.current = null;
                    }
                    
                    console.log('Celebration ended, player is host:', isHost);
                    
                    if (isHost) {
                        // Host advances directly
                        console.log('Host advancing to next round');
                        const newRound = currentRound + 1;
                        prevRoundRef.current = newRound;
                        
                        supabase.from('rooms').update({ current_round: newRound }).eq('id', roomId).then(({ error }) => {
                            if (error) {
                                console.error('Error updating round:', error);
                            } else {
                                console.log('Round updated to:', newRound, 'calling runRound()');
                                celebrationStartedRef.current = false;
                                runRound();
                            }
                        });
                    } else {
                        // Non-host signals host to advance
                        console.log('Non-host signaling host to advance round');
                        const newRound = currentRound + 1;
                        
                        // Update round in database so host can pick it up
                        supabase.from('rooms').update({ current_round: newRound }).eq('id', roomId).then(({ error }) => {
                            if (error) {
                                console.error('Error updating round:', error);
                            } else {
                                console.log('Non-host updated round to:', newRound, 'broadcasting advance signal');
                                celebrationStartedRef.current = false;
                                // Broadcast signal to host
                                broadcastEvent('advance_round', { round: newRound });
                            }
                        });
                    }
                }
            }, 1000);
            
            return () => {
                console.log('Cleaning up celebration timer');
                if (celebrationIntervalRef.current) {
                    clearInterval(celebrationIntervalRef.current);
                    celebrationIntervalRef.current = null;
                }
            };
        } else if (phase !== 'celebration') {
            // Reset flag when leaving celebration phase
            celebrationStartedRef.current = false;
        }
    }, [phase, room?.id]);

    const getDeterministicIndex = (seedText: string, max: number) => {
        let hash = 0;
        for (let i = 0; i < seedText.length; i++) {
            hash = (hash * 31 + seedText.charCodeAt(i)) % 1000000007;
        }
        return hash % max;
    };

    const handleShowAgain = () => {
        setShowWord(true);
        setTimeout(() => {
            setShowWord(false);
        }, 3000);
    };

    const handleJoin = async () => {
        if (!nickname) return;
        setIsJoining(true);
        try {
            const { data, error } = await supabase
                .from('players')
                .insert({
                    room_id: room.id,
                    nickname,
                    is_host: isHostInitial
                })
                .select()
                .single();

            if (error) throw error;
            setPlayer(data);
            localStorage.setItem(`player_${code}`, data.id);
            setPhase('lobby');
        } catch (error: any) {
            toast.error('Error al unirse: ' + error.message);
        } finally {
            setIsJoining(false);
        }
    };

    const selectTeam = async (teamId: string) => {
        if (!player || player.team_id) return;
        const { error } = await supabase
            .from('players')
            .update({ team_id: teamId })
            .eq('id', player.id);
        if (error) toast.error('Error al seleccionar equipo');
    };

    const startGame = async () => {
        const team1P = players.filter(p => p.team_id === teams[0].id);
        const team2P = players.filter(p => p.team_id === teams[1].id);

        if (team1P.length === 0 || team2P.length === 0) {
            toast.error('Cada equipo debe tener al menos un jugador');
            return;
        }

        await supabase.from('rooms').update({ status: 'voting' }).eq('id', room.id);
    };

    const voteCategory = async (categoryId: string) => {
        if (selectedCategoryId) return;
        if (categoryId === 'custom') {
            setIsCustomModalOpen(true);
            return;
        }
        const { error } = await supabase.from('votes').insert({
            room_id: room.id, player_id: player.id, category_id: categoryId
        });
        if (!error) setSelectedCategoryId(categoryId);
    };

    const handleCustomWordConfirm = async () => {
        if (!customWordInput) return;
        // Broadcast the vote instead of inserting into DB to avoid UUID type error
        broadcastEvent('custom_vote', { player_id: player.id, word: customWordInput });

        // Attempt to save to "personalizados" table if it exists (swallow errors)
        try {
            await supabase.from('personalizados').insert({
                room_id: room.id,
                player_id: player.id,
                word: customWordInput
            });
        } catch (e) { /* Table might not exist */ }

        setSelectedCategoryId('custom');
        setIsCustomModalOpen(false);
        broadcastEvent('custom_word', { word: customWordInput });
        setActiveCustomWord(customWordInput);
        // Add to local votes for immediate feedback
        setCustomVotes(prev => [...prev, { player_id: player.id, word: customWordInput }]);
    };

    const broadcastEvent = async (type: string, payload: any) => {
        await supabase.channel(`room:${code}`).send({
            type: 'broadcast',
            event: 'game_event',
            payload: { type, ...payload }
        });
    };

    const startLoop = async () => {
        const counts: any = {};
        votes.forEach(v => counts[v.category_id] = (counts[v.category_id] || 0) + 1);

        // Add custom votes to the count
        // We deduplicate by player_id to avoid double counting if someone switches votes or broadcast-lag
        const uniqueCustomPlayers = new Set();
        customVotes.forEach(v => {
            if (!uniqueCustomPlayers.has(v.player_id)) {
                uniqueCustomPlayers.add(v.player_id);
                counts['custom'] = (counts['custom'] || 0) + 1;
            }
        });

        // Find max votes
        let max = 0;
        Object.values(counts).forEach((c: any) => { if (c > max) max = c; });

        // Get all categories with max votes
        const winners = Object.keys(counts).filter(id => counts[id] === max);

        if (winners.length > 1 && max > 0) {
            // TIE BREAKER!
            await supabase.from('votes').delete().eq('room_id', room.id); // Clear DB votes
            setVotes([]);
            setCustomVotes([]); // Clear virtual votes
            setTiebreakerCategoryIds(winners);
            setSelectedCategoryId(null);
            broadcastEvent('tiebreaker', { categoryIds: winners });
            setWinnerModal({ name: '¡EMPATE!', type: 'tiebreaker' });
            setTimeout(() => setWinnerModal(null), 3000);
            return;
        }

        const winnerCat = winners[0] || categories[0]?.id;
        const winnerName = winnerCat === 'custom' ? "Personalizado" : (categories.find(c => c.id === winnerCat)?.name || "Categoría");

        await supabase.from('rooms').update({ category_id: winnerCat === 'custom' ? null : winnerCat }).eq('id', room.id);
        setWinnerModal({ name: winnerName.toUpperCase(), type: 'category' });
        setTimeout(() => setWinnerModal(null), 3000);
        runRound();
    };

    const runRound = async () => {
        if (!player?.is_host) return;

        const { data: latestRoom } = await supabase.from('rooms').select('*').eq('id', room.id).single();
        const { data: latestTeams } = await supabase.from('teams').select('*').eq('room_id', room.id).order('team_number', { ascending: true });

        if (!latestTeams || latestTeams.length < 2) {
            toast.error('Error al obtener los equipos');
            return;
        }

        // Check if any team reached the target score (rounds field is used as target score)
        const t1 = latestTeams[0].score;
        const t2 = latestTeams[1].score;
        const targetScore = latestRoom.rounds; // Using 'rounds' field as target score
        
        if (t1 >= targetScore || t2 >= targetScore) {
            // Game over - someone reached the target
            const win = t1 > t2 ? 1 : (t2 > t1 ? 2 : 0);
            await supabase.from('rooms').update({ status: 'results' }).eq('id', room.id);
            broadcastEvent('winner', { team: win });
            setWinnerTeam(win);
            return;
        }

        const t1p = players.filter(p => p.team_id === latestTeams[0].id).sort((a, b) => a.id.localeCompare(b.id));
        const t2p = players.filter(p => p.team_id === latestTeams[1].id).sort((a, b) => a.id.localeCompare(b.id));

        if (t1p.length === 0 || t2p.length === 0) {
            toast.error('Faltan jugadores en los equipos');
            return;
        }

        const seedBase = `${code}-${latestRoom.current_round}`;
        const p1 = t1p[getDeterministicIndex(seedBase + "-p1", t1p.length)];
        const p2 = t2p[getDeterministicIndex(seedBase + "-p2", t2p.length)];

        await supabase.from('rooms').update({ status: 'countdown_performer' }).eq('id', room.id);
        broadcastEvent('performers', { p1, p2 });

        let count = 10;
        setCountdown(count);
        broadcastEvent('countdown', { value: count });

        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            count--;
            setCountdown(count);
            broadcastEvent('countdown', { value: count });
            if (count <= 0) {
                if (timerRef.current) clearInterval(timerRef.current);
                startReadyPhase(p1, p2);
            }
        }, 1000);
    };

    const startReadyPhase = async (p1: any, p2: any) => {
        await supabase.from('rooms').update({ status: 'countdown_ready' }).eq('id', room.id);

        let count = 8;
        setCountdown(count);
        broadcastEvent('countdown', { value: count });

        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            count--;
            setCountdown(count);
            broadcastEvent('countdown', { value: count });
            if (count <= 0) {
                if (timerRef.current) clearInterval(timerRef.current);
                startPerformingPhase(p1, p2);
            }
        }, 1000);
    };

    const startPerformingPhase = async (p1: any, p2: any) => {
        const { data: currentRoom } = await supabase.from('rooms').select('category_id, current_round').eq('id', room.id).single();
        const catId = currentRoom?.category_id;
        const round = currentRoom?.current_round;

        const { data: words } = await supabase.from('words').select('text').eq('category_id', catId).order('text', { ascending: true });

        let word = "Error: No words";
        if (catId === null || catId === 'custom') {
            word = activeCustomWord || "Personalizado";
        } else if (words && words.length > 0) {
            const seed = `${code}-${round}-${catId}`;
            const idx = getDeterministicIndex(seed, words.length);
            word = words[idx].text;
        }

        if (player?.is_host) {
            await supabase.from('rooms').update({ status: 'performing' }).eq('id', room.id);
        }

        setCurrentWord(word);
        broadcastEvent('word', { word });
        broadcastEvent('performers', { p1, p2 });

        // Reset score button and broadcast to all clients
        setScoreButtonDisabled(false);
        broadcastEvent('score_button_state', { disabled: false });
        
        // Only host manages the timer to keep all clients in sync
        if (player?.is_host) {
            setPerformingTimer(45);
            broadcastEvent('performing_timer', { value: 45 });
            
            if (performingTimerRef.current) clearInterval(performingTimerRef.current);
            let timeLeft = 45;
            performingTimerRef.current = setInterval(() => {
                timeLeft--;
                setPerformingTimer(timeLeft);
                broadcastEvent('performing_timer', { value: timeLeft });
                
                if (timeLeft <= 0) {
                    if (performingTimerRef.current) clearInterval(performingTimerRef.current);
                    // Auto-advance to next round if time runs out without scoring
                    console.log('Time ran out, advancing to next round');
                    const newRound = room.current_round + 1;
                    supabase.from('rooms').update({ current_round: newRound }).eq('id', room.id).then(() => {
                        prevRoundRef.current = newRound;
                        runRound();
                    });
                }
            }, 1000);
        }
    };

    const handleScore = async (teamIndex: number) => {
        if (scoreButtonDisabled) return;
        
        setScoreButtonDisabled(true);
        broadcastEvent('score_button_state', { disabled: true });
        
        // Stop the performing timer for all clients
        if (performingTimerRef.current) {
            clearInterval(performingTimerRef.current);
            performingTimerRef.current = null;
        }
        
        // Broadcast to stop timer on all clients
        broadcastEvent('stop_performing_timer', {});
        
        const team = teams[teamIndex];
        await supabase
            .from('teams')
            .update({ score: team.score + 1 })
            .eq('id', team.id);

        // Show celebration screen for all players (including host)
        setLastScoringTeam(teamIndex + 1);
        setPhase('celebration'); // Set phase locally for immediate feedback
        broadcastEvent('celebration', { team: teamIndex + 1 });
        
        // Host also updates the room status in database
        if (player?.is_host) {
            await supabase.from('rooms').update({ status: 'celebration' }).eq('id', room.id);
        }
    };

    if (!room) return <div className="min-h-screen flex items-center justify-center bg-slate-950"><Loader2 className="animate-spin text-pink-500 h-12 w-12" /></div>;

    const isPerformer = player && (player.id === performer1?.id || player.id === performer2?.id);

    if (!player) {
        return (
            <div className="min-h-dvh bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
                {/* Background blobs */}
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-pink-600/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full" />

                <Card className="w-full max-w-md bg-slate-900/50 backdrop-blur-2xl border-white/5 text-white shadow-2xl animate-in fade-in zoom-in duration-500">
                    <CardHeader className="text-center space-y-2">
                        <CardTitle className="text-3xl font-black tracking-tight text-pink-400">Unirse a: {code}</CardTitle>
                        <CardDescription className="text-slate-400 font-medium text-lg italic">Introduce tu apodo para comenzar</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-4">
                        <div className="space-y-3">
                            <Label htmlFor="nickname" className="text-xs font-bold uppercase tracking-widest text-slate-500 ml-1">Vuestro apodo</Label>
                            <Input
                                id="nickname"
                                value={nickname}
                                onChange={(e) => setNickname(e.target.value)}
                                placeholder="Ej: MimoGenius"
                                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-14 text-lg font-bold focus:ring-pink-500/50 px-6 rounded-2xl transition-all"
                            />
                        </div>
                        <Button
                            onClick={handleJoin}
                            disabled={isJoining || !nickname}
                            className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 h-16 text-xl font-black tracking-tight shadow-lg shadow-pink-600/20 active:scale-[0.98] transition-all rounded-2xl"
                        >
                            {isJoining ? <Loader2 className="animate-spin" /> : 'ENTRAR AL JUEGO'}
                        </Button>
                    </CardContent>
                    <CardFooter className="justify-center pb-8">
                        <div className="flex gap-1.5">
                            <div className="h-1 w-1 bg-pink-500/50 rounded-full" />
                            <div className="h-1 w-1 bg-purple-500/50 rounded-full" />
                            <div className="h-1 w-1 bg-indigo-500/50 rounded-full" />
                        </div>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-dvh bg-slate-950 text-white p-4 sm:p-6 font-sans selection:bg-pink-500/30 overflow-x-hidden">
            <div className="max-w-4xl mx-auto space-y-6">

                {/* Header Stats */}
                <div className="flex justify-between items-center bg-slate-900/80 p-4 rounded-2xl border border-white/5 backdrop-blur-md sticky top-[calc(1rem+env(safe-area-inset-top))] z-50 shadow-xl">
                    <div className="flex gap-3 sm:gap-6 items-center">
                        {teams.map((t, i) => (
                            <div key={t.id} className={`px-4 py-2 rounded-xl border ${i === 0 ? 'border-blue-500/30 bg-blue-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                                <div className={`text-[10px] uppercase font-bold tracking-tighter ${i === 0 ? 'text-blue-400' : 'text-red-400'}`}>Equipo {t.team_number}</div>
                                <div className="text-3xl font-black">{t.score}</div>
                            </div>
                        ))}
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] opacity-40 uppercase font-bold tracking-widest">Objetivo</div>
                        <div className="text-2xl font-black text-pink-500 font-mono">
                            {room.rounds} <span className="text-white/20 text-sm">puntos</span>
                        </div>
                    </div>
                </div>

                {/* Phase Renderers */}
                {phase === 'lobby' && (
                    <div className="grid gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <div className="flex flex-col items-center gap-4 py-6">
                            <div className="p-4 bg-white rounded-2xl shadow-2xl shadow-pink-500/20">
                                <QRCodeSVG value={`${typeof window !== 'undefined' ? window.location.origin : ''}/room/${code}`} size={160} />
                            </div>
                            <p className="text-slate-400 font-medium">Escanea para unirte o usa el código <span className="text-white font-black">{code}</span></p>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                            {teams.map((team, idx) => (
                                <Card key={team.id} className={`bg-slate-900/50 border-slate-800 text-white backdrop-blur-sm overflow-hidden transition-all ${!player?.team_id ? 'hover:border-pink-500/50' : ''}`}>
                                    <div className={`h-1 w-full ${idx === 0 ? 'bg-blue-500' : 'bg-red-500'}`} />
                                    <CardHeader className="pb-2">
                                        <CardTitle className="flex justify-between items-center">
                                            Equipo {team.team_number}
                                            <Badge variant="outline" className="text-slate-400">{players.filter(p => p.team_id === team.id).length} jugadores</Badge>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3 pb-6">
                                        <div className="min-h-[100px] space-y-2">
                                            {players.filter(p => p.team_id === team.id).map(p => (
                                                <div key={p.id} className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-lg text-sm font-medium animate-in zoom-in-95">
                                                    <div className={`h-2 w-2 rounded-full ${idx === 0 ? 'bg-blue-500' : 'bg-red-500'}`} />
                                                    {p.nickname} {p.id === player?.id && <span className="text-pink-400 text-[10px] font-bold ml-1">(TÚ)</span>}
                                                </div>
                                            ))}
                                            {players.filter(p => p.team_id === team.id).length === 0 && <p className="text-slate-600 text-xs italic py-4">Esperando jugadores...</p>}
                                        </div>
                                        {player && !player.team_id && (
                                            <Button onClick={() => selectTeam(team.id)} className={`w-full font-bold mt-4 ${idx === 0 ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}`}>
                                                UNIRSE AL EQUIPO {team.team_number}
                                            </Button>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        {player?.is_host && (
                            <Button onClick={startGame} size="lg" className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 h-20 text-2xl font-black shadow-lg shadow-pink-600/20 group">
                                <Play className="mr-3 group-hover:scale-125 transition-transform" /> ¡EMPEZAR PARTIDA!
                            </Button>
                        )}
                    </div>
                )}

                {phase === 'voting' && (
                    <Card className="bg-slate-900 border-white/10 text-white text-center py-12 px-6 shadow-2xl animate-in zoom-in-95 duration-500">
                        <h2 className="text-4xl font-black mb-2 uppercase tracking-tighter">Votación</h2>
                        <p className="text-slate-400 mb-10">La categoría con más votos decidirá el destino del juego</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
                            {categories
                                .filter(c => tiebreakerCategoryIds.length === 0 || tiebreakerCategoryIds.includes(c.id))
                                .map(c => {
                                    const voteCount = votes.filter(v => v.category_id === c.id).length;
                                    return (
                                        <Button
                                            key={c.id}
                                            disabled={!!selectedCategoryId && selectedCategoryId !== c.id}
                                            onClick={() => voteCategory(c.id)}
                                            variant={selectedCategoryId === c.id ? "default" : "outline"}
                                            className={`h-16 text-lg font-bold transition-all relative overflow-hidden ${selectedCategoryId === c.id ? "bg-pink-600 hover:bg-pink-600 scale-105 text-white" : "bg-white text-black border-slate-200 hover:bg-slate-100"}`}
                                        >
                                            {c.name}
                                            <Badge className={`absolute top-1 right-1 text-[10px] ${selectedCategoryId === c.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"}`}>{voteCount}</Badge>
                                        </Button>
                                    );
                                })}

                            {/* Custom Category Option */}
                            {(tiebreakerCategoryIds.length === 0 || tiebreakerCategoryIds.includes('custom')) && (
                                <Button
                                    disabled={!!selectedCategoryId && selectedCategoryId !== 'custom'}
                                    onClick={() => voteCategory('custom')}
                                    variant={selectedCategoryId === 'custom' ? "default" : "outline"}
                                    className={`h-16 text-lg font-bold transition-all relative overflow-hidden ${selectedCategoryId === 'custom' ? "bg-pink-600 hover:bg-pink-600 scale-105 text-white" : "bg-white text-black border-dashed border-2 border-pink-200 hover:border-pink-400 hover:bg-pink-50/50"}`}
                                >
                                    <Edit2 className="mr-2 h-5 w-5" /> PERSONALIZADO
                                    <Badge className={`absolute top-1 right-1 text-[10px] ${selectedCategoryId === 'custom' ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"}`}>
                                        {Array.from(new Set(customVotes.map(v => v.player_id))).length}
                                    </Badge>
                                </Button>
                            )}
                        </div>
                        {player?.is_host && <Button onClick={startLoop} className="mt-12 bg-green-600 font-black px-12 h-14 text-lg hover:bg-green-500">CERRAR VOTACIONES</Button>}
                    </Card>
                )}

                {phase === 'countdown_performer' && (
                    <div className="text-center space-y-12 py-20 animate-in zoom-in-50 duration-500">
                        <div className="space-y-4">
                            <h2 className="text-5xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-b from-pink-400 to-pink-600">Próximos Mimos</h2>
                            <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">Se anuncian los elegidos...</p>
                        </div>
                        <div className="flex flex-col sm:flex-row justify-center items-center gap-8 sm:gap-20">
                            <div className="space-y-2">
                                <div className="text-blue-400 font-black text-3xl uppercase">{performer1?.nickname || "???"}</div>
                                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">EQUIPO 1</Badge>
                            </div>
                            <div className="text-4xl font-black text-white/10">VS</div>
                            <div className="space-y-2">
                                <div className="text-red-400 font-black text-3xl uppercase">{performer2?.nickname || "???"}</div>
                                <Badge className="bg-red-500/20 text-red-400 border-red-500/30">EQUIPO 2</Badge>
                            </div>
                        </div>
                        <div className="text-7xl sm:text-9xl font-black text-white/10 tabular-nums mt-10 animate-pulse">
                            {countdown}
                        </div>
                    </div>
                )}

                {phase === 'countdown_ready' && (
                    <div className="text-center space-y-10 py-20 animate-in fade-in duration-300">
                        <div className="relative h-44 w-44 mx-auto mb-10">
                            <div className="absolute inset-0 rounded-full border-8 border-yellow-400/20" />
                            <div className="absolute inset-0 rounded-full border-8 border-yellow-400 border-t-transparent animate-spin [animation-duration:3s]" />
                            <div className="absolute inset-0 flex items-center justify-center text-6xl font-black text-yellow-400 drop-shadow-lg">{countdown}</div>
                        </div>
                        <div className="space-y-8">
                            <h2 className="text-5xl font-black uppercase tracking-tighter">
                                {isPerformer ? '¡Pónganse de pie!' : '¡Prepárense!'}
                            </h2>
                            {isPerformer ? (
                                <div className="bg-green-500 text-slate-950 p-6 rounded-3xl animate-bounce shadow-2xl shadow-green-500/40 max-w-sm mx-auto">
                                    <p className="text-3xl font-black italic">¡TE TOCA A TI!</p>
                                    <p className="font-bold text-lg">Pasa al frente ahora mismo</p>
                                </div>
                            ) : (
                                <p className="text-slate-400 text-xl font-medium italic">Esperando que los mimos se preparen...</p>
                            )}
                        </div>
                    </div>
                )}

                {phase === 'performing' && (
                    <div className="text-center space-y-12 py-10 animate-in slide-in-from-top-10 duration-500">
                        {isPerformer ? (
                            <div className="space-y-10 max-w-2xl mx-auto">
                                {/* Mostrar número de equipo y timer */}
                                <div className="flex justify-between items-center bg-slate-900/80 p-6 rounded-2xl border border-white/5 backdrop-blur-md shadow-xl">
                                    <div className={`px-6 py-3 rounded-xl border ${player?.team_id === teams[0]?.id ? 'border-blue-500/50 bg-blue-500/10' : 'border-red-500/50 bg-red-500/10'}`}>
                                        <div className={`text-xs uppercase font-bold tracking-wider ${player?.team_id === teams[0]?.id ? 'text-blue-400' : 'text-red-400'}`}>Tu Equipo</div>
                                        <div className="text-4xl font-black">{player?.team_id === teams[0]?.id ? '1' : '2'}</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-xs opacity-40 uppercase font-bold tracking-widest mb-1">Tiempo</div>
                                        <div className={`text-5xl font-black font-mono ${performingTimer <= 10 ? 'text-red-500 animate-pulse' : 'text-pink-500'}`}>
                                            {performingTimer}s
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <Badge className="text-sm px-4 py-1 bg-pink-600 rounded-full font-bold uppercase tracking-widest">
                                        {showWord ? 'Memoriza tu palabra' : '¡A actuar!'}
                                    </Badge>

                                    <div className="relative min-h-[200px] flex items-center justify-center">
                                        {showWord ? (
                                            <div className="w-full text-4xl sm:text-5xl md:text-7xl font-black text-white bg-slate-900 p-8 sm:p-12 rounded-[2rem] border-4 border-pink-600 shadow-2xl shadow-pink-600/30 tracking-tight leading-tight break-words overflow-hidden animate-in zoom-in duration-300">
                                                {currentWord}
                                            </div>
                                        ) : (
                                            <div className="w-full flex flex-col items-center gap-4 bg-slate-900/50 p-12 rounded-[2rem] border-2 border-white/5 backdrop-blur-sm animate-in fade-in duration-500">
                                                <Zap className="h-12 w-12 text-pink-500 animate-pulse" />
                                                <p className="text-slate-400 font-bold uppercase tracking-widest text-sm text-center">Palabra oculta por seguridad</p>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={handleShowAgain}
                                                    className="text-pink-400 hover:text-pink-300 hover:bg-white/5"
                                                >
                                                    VER DE NUEVO (3s)
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-10">
                                    {(player?.is_host || player?.id === performer1?.id) && (
                                        <Button 
                                            onClick={() => handleScore(0)} 
                                            disabled={scoreButtonDisabled}
                                            size="lg" 
                                            className="bg-blue-600 hover:bg-blue-500 h-24 text-2xl font-black rounded-2xl shadow-xl shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            EQUIPO 1 ACERTÓ
                                        </Button>
                                    )}
                                    {(player?.is_host || player?.id === performer2?.id) && (
                                        <Button 
                                            onClick={() => handleScore(1)} 
                                            disabled={scoreButtonDisabled}
                                            size="lg" 
                                            className="bg-red-600 hover:bg-red-500 h-24 text-2xl font-black rounded-2xl shadow-xl shadow-red-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            EQUIPO 2 ACERTÓ
                                        </Button>
                                    )}
                                </div>
                                {!player?.is_host && !isPerformer && <p className="text-slate-500 font-bold uppercase">Solo los mimicos o el host pueden marcar el punto</p>}
                            </div>
                        ) : (
                            <div className="space-y-8 max-w-2xl mx-auto py-10">
                                {/* Mostrar número de equipo y timer para espectadores */}
                                <div className="flex justify-between items-center bg-slate-900/80 p-6 rounded-2xl border border-white/5 backdrop-blur-md shadow-xl max-w-lg mx-auto">
                                    <div className={`px-6 py-3 rounded-xl border ${player?.team_id === teams[0]?.id ? 'border-blue-500/50 bg-blue-500/10' : 'border-red-500/50 bg-red-500/10'}`}>
                                        <div className={`text-xs uppercase font-bold tracking-wider ${player?.team_id === teams[0]?.id ? 'text-blue-400' : 'text-red-400'}`}>Tu Equipo</div>
                                        <div className="text-4xl font-black">{player?.team_id === teams[0]?.id ? '1' : '2'}</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-xs opacity-40 uppercase font-bold tracking-widest mb-1">Tiempo Restante</div>
                                        <div className={`text-4xl font-black font-mono ${performingTimer <= 10 ? 'text-red-500 animate-pulse' : 'text-pink-500'}`}>
                                            {performingTimer}s
                                        </div>
                                    </div>
                                </div>

                                <div className="relative">
                                    <Zap className="h-24 w-24 mx-auto text-pink-500 animate-glow" />
                                    <div className="absolute inset-0 bg-pink-500/20 blur-3xl rounded-full" />
                                </div>
                                <div className="space-y-4">
                                    <h2 className="text-5xl font-black uppercase italic tracking-tighter">¡Adivinando!</h2>
                                    <p className="text-2xl text-slate-400 font-medium px-4">Mira a <span className="text-blue-400">{performer1?.nickname}</span> y <span className="text-red-400">{performer2?.nickname}</span> atentamente</p>
                                </div>
                                <div className="pt-10 flex justify-center gap-10">
                                    <div className="h-2 w-2 bg-pink-500 rounded-full animate-ping" />
                                    <div className="h-2 w-2 bg-pink-500 rounded-full animate-ping [animation-delay:200ms]" />
                                    <div className="h-2 w-2 bg-pink-500 rounded-full animate-ping [animation-delay:400ms]" />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {phase === 'celebration' && (
                    <div className="text-center space-y-12 py-20 animate-in zoom-in-50 duration-700">
                        {/* Timer de celebración */}
                        <div className="absolute top-24 right-8 bg-slate-900/80 p-4 rounded-2xl border border-white/5 backdrop-blur-md shadow-xl">
                            <div className="text-xs opacity-40 uppercase font-bold tracking-widest mb-1">Siguiente ronda en</div>
                            <div className={`text-4xl font-black font-mono ${celebrationTimer <= 2 ? 'text-yellow-500 animate-pulse' : 'text-pink-500'}`}>
                                {celebrationTimer}s
                            </div>
                        </div>
                        
                        <div className="relative inline-block">
                            <Sparkles className="h-32 w-32 mx-auto text-yellow-400 animate-pulse" />
                            <div className="absolute inset-0 bg-yellow-400/30 blur-[100px] rounded-full animate-pulse" />
                        </div>
                        <div className="space-y-6">
                            <h1 className="text-7xl sm:text-8xl font-black uppercase tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-pink-400 via-purple-400 to-indigo-400 animate-in slide-in-from-bottom-10 duration-500">
                                ¡FELICIDADES!
                            </h1>
                            <div className={`text-5xl font-black uppercase ${lastScoringTeam === 1 ? 'text-blue-400' : 'text-red-400'} animate-bounce`}>
                                EQUIPO {lastScoringTeam} ACERTÓ
                            </div>
                            <p className="text-2xl text-slate-400 font-bold tracking-widest uppercase animate-in fade-in duration-1000 delay-300">
                                La palabra era: <span className="text-white">{currentWord}</span>
                            </p>
                        </div>
                        <div className="flex justify-center gap-4 pt-8">
                            <div className="h-3 w-3 bg-pink-500 rounded-full animate-bounce" />
                            <div className="h-3 w-3 bg-purple-500 rounded-full animate-bounce [animation-delay:150ms]" />
                            <div className="h-3 w-3 bg-indigo-500 rounded-full animate-bounce [animation-delay:300ms]" />
                        </div>
                    </div>
                )}

                {phase === 'results' && (
                    <div className="text-center space-y-12 py-10 animate-in zoom-in duration-1000">
                        <div className="relative inline-block">
                            <Trophy className="h-48 w-48 mx-auto text-yellow-400" />
                            <div className="absolute inset-0 bg-yellow-400/20 blur-[100px] rounded-full" />
                        </div>
                        <div className="space-y-4">
                            <h1 className="text-8xl font-black italic uppercase tracking-tighter">
                                {winnerTeam === 0 ? "¡EMPATE!" : `¡GANA EQUIPO ${winnerTeam}!`}
                            </h1>
                            <p className="text-2xl text-slate-400 font-bold tracking-widest uppercase">Fin de la partida</p>
                        </div>
                        <Button onClick={() => router.push('/')} size="lg" variant="outline" className="h-16 px-10 rounded-2xl border-white/20 hover:bg-white/10 text-xl font-bold">
                            <ArrowLeft className="mr-2" /> VOLVER AL INICIO
                        </Button>
                    </div>
                )}

            </div>

            {/* Overlays UI */}
            {winnerModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-500">
                    <div className={`text-center p-8 rounded-3xl shadow-2xl animate-in zoom-in-95 duration-500 ${winnerModal.type === 'tiebreaker' ? 'bg-yellow-500 text-slate-950' : 'bg-pink-600 text-white'}`}>
                        {winnerModal.type === 'tiebreaker' ? (
                            <div className="space-y-4">
                                <AlertTriangle className="h-24 w-24 mx-auto text-slate-950 animate-bounce" />
                                <h2 className="text-6xl font-black uppercase tracking-tighter">¡EMPATE!</h2>
                                <p className="text-2xl font-bold">Votad de nuevo entre los finalistas</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <Sparkles className="h-24 w-24 mx-auto text-white animate-pulse" />
                                <h2 className="text-6xl font-black uppercase tracking-tighter">¡{winnerModal.name}!</h2>
                                <p className="text-2xl font-bold">Categoría ganadora</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal for Custom Word */}
            <Dialog open={isCustomModalOpen} onOpenChange={setIsCustomModalOpen}>
                <DialogContent className="bg-slate-900 border-white/10 text-white sm:max-w-[425px] rounded-3xl backdrop-blur-xl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black text-pink-400">Categoría Personalizada</DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Escribe la palabra o frase que los mimos deberán representar.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-6 scroll-m-20">
                        <Label htmlFor="custom-word" className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 block">Palabra Secreta</Label>
                        <Input
                            id="custom-word"
                            value={customWordInput}
                            onChange={(e) => setCustomWordInput(e.target.value)}
                            placeholder="Ej: Salto en paracaídas"
                            className="bg-white/5 border-white/10 text-white h-14 text-lg font-bold rounded-2xl focus:ring-pink-500"
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            onClick={handleCustomWordConfirm}
                            disabled={!customWordInput}
                            className="w-full bg-pink-600 hover:bg-pink-500 h-14 text-lg font-black rounded-2xl shadow-lg shadow-pink-600/20"
                        >
                            CONFIRMAR Y VOTAR
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <style jsx global>{`
        @keyframes glow {
          0%, 100% { filter: drop-shadow(0 0 5px rgba(236, 72, 153, 0.5)); }
          50% { filter: drop-shadow(0 0 20px rgba(236, 72, 153, 0.8)); }
        }
        .animate-glow {
          animation: glow 2s ease-in-out infinite;
        }
      `}</style>
        </div >
    );
}
