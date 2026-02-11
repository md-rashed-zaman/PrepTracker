package contests

import (
	"math"
	"sort"
	"strings"
	"time"

	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/problems"
)

type candidate struct {
	problem problems.Problem
	state   problems.UserState
	score   float64
}

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func masteryScore(reps int, ease float64, overdueDays int) float64 {
	overduePenalty := float64(overdueDays * 2)
	if overduePenalty > 30 {
		overduePenalty = 30
	}
	m := 20*math.Log2(float64(reps)+1) + 25*(ease-1.3) - overduePenalty
	return clamp(m, 0, 100)
}

func overdueDays(now time.Time, dueAt time.Time) int {
	if now.Before(dueAt) {
		return 0
	}
	d := now.Sub(dueAt)
	return int(d.Hours() / 24)
}

func hasRecentFail(s problems.UserState, now time.Time) bool {
	if s.LastGrade == nil || s.LastReviewAt == nil {
		return false
	}
	if *s.LastGrade > 1 {
		return false
	}
	return now.Sub(*s.LastReviewAt) <= 14*24*time.Hour
}

type DifficultyMix struct {
	Easy   int `json:"easy"`
	Medium int `json:"medium"`
	Hard   int `json:"hard"`
}

type GenerateParams struct {
	Strategy        string        `json:"strategy"`
	DurationMinutes int           `json:"duration_minutes"`
	DifficultyMix   DifficultyMix `json:"difficulty_mix"`
}

func (p GenerateParams) totalCount() int {
	return p.DifficultyMix.Easy + p.DifficultyMix.Medium + p.DifficultyMix.Hard
}

func normalizeDifficulty(d string) string {
	d = strings.TrimSpace(strings.ToLower(d))
	switch d {
	case "easy", "medium", "hard":
		return d
	default:
		return "unknown"
	}
}

func topicSet(topics []string) map[string]struct{} {
	out := make(map[string]struct{}, len(topics))
	for _, t := range topics {
		t = strings.TrimSpace(strings.ToLower(t))
		if t == "" {
			continue
		}
		out[t] = struct{}{}
	}
	return out
}

func pickContestProblems(now time.Time, params GenerateParams, all []problems.ProblemWithState) []problems.Problem {
	// Deterministic scoring and selection so tests are stable.
	strategy := strings.TrimSpace(strings.ToLower(params.Strategy))
	if strategy == "" {
		strategy = "balanced"
	}

	buckets := map[string][]candidate{
		"easy":   {},
		"medium": {},
		"hard":   {},
	}

	for _, p := range all {
		d := normalizeDifficulty(p.Difficulty)
		if d == "unknown" {
			continue
		}
		od := overdueDays(now, p.State.DueAt)
		mastery := masteryScore(p.State.Reps, p.State.Ease, od)
		recentFail := 0.0
		if hasRecentFail(p.State, now) {
			recentFail = 15
		}
		// Base priority from AGENTS.md.
		score := float64(3*od) + 2*(100-mastery) + recentFail
		switch strategy {
		case "due-heavy":
			score += float64(2 * od)
		case "weakness":
			score += float64(100 - mastery)
		}
		buckets[d] = append(buckets[d], candidate{
			problem: p.Problem,
			state:   p.State,
			score:   score,
		})
	}

	for _, k := range []string{"easy", "medium", "hard"} {
		sort.SliceStable(buckets[k], func(i, j int) bool {
			if buckets[k][i].score == buckets[k][j].score {
				return buckets[k][i].state.DueAt.Before(buckets[k][j].state.DueAt)
			}
			return buckets[k][i].score > buckets[k][j].score
		})
	}

	want := map[string]int{
		"easy":   params.DifficultyMix.Easy,
		"medium": params.DifficultyMix.Medium,
		"hard":   params.DifficultyMix.Hard,
	}
	usedTopics := map[string]int{}
	chosen := make([]problems.Problem, 0, params.totalCount())

	pickFrom := func(bucket string) {
		for want[bucket] > 0 && len(buckets[bucket]) > 0 {
			bestIdx := 0
			if strategy == "balanced" {
				// Greedy: prefer a candidate that introduces new topics.
				for i := 0; i < len(buckets[bucket]); i++ {
					ts := topicSet(buckets[bucket][i].problem.Topics)
					newTopics := 0
					for t := range ts {
						if usedTopics[t] == 0 {
							newTopics++
						}
					}
					if newTopics > 0 {
						bestIdx = i
						break
					}
				}
			}
			c := buckets[bucket][bestIdx]
			// Remove selected.
			buckets[bucket] = append(buckets[bucket][:bestIdx], buckets[bucket][bestIdx+1:]...)
			for t := range topicSet(c.problem.Topics) {
				usedTopics[t]++
			}
			chosen = append(chosen, c.problem)
			want[bucket]--
		}
	}

	pickFrom("easy")
	pickFrom("medium")
	pickFrom("hard")

	return chosen
}

