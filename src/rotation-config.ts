export const WORKOUT_SLOTS = ["A1", "B1", "A2", "B2", "A3", "B3"] as const;
export type WorkoutSlot = (typeof WORKOUT_SLOTS)[number];

export const CORE_BODY_PARTS = {
  A: ["chest", "shoulders", "triceps", "back_width", "back_thickness"],
  B: ["biceps", "forearms", "calves", "hamstrings", "quadriceps"],
} as const;

export const ASSIGNMENT_POSITIONS = [
  ...CORE_BODY_PARTS.A,
  ...CORE_BODY_PARTS.B,
  "abs_1",
  "abs_2",
] as const;
export type AssignmentPosition = (typeof ASSIGNMENT_POSITIONS)[number];
export type BodyPart = Exclude<AssignmentPosition, "abs_1" | "abs_2"> | "abs";

export const EXERCISES = {
  chest: [
    "Incline barbell press",
    "Flat barbell press",
    "Decline barbell press",
    "Incline football-bar press",
    "Flat football-bar press",
    "Decline football-bar press",
    "Incline dumbbell press",
    "Flat dumbbell press",
    "Decline dumbbell press",
  ],
  shoulders: [
    "Standing barbell military press",
    "Seated barbell front press",
    "Standing behind-neck barbell press",
    "Seated behind-neck barbell press",
    "Seated football-bar shoulder press",
    "High-incline football-bar press",
    "Standing dumbbell shoulder press",
    "Seated dumbbell shoulder press",
    "Wide-grip barbell upright row",
    "EZ-bar upright row",
    "Football-bar upright row",
    "Cable upright row",
    "Clean and press",
  ],
  triceps: [
    "Close-grip barbell bench press",
    "Close-grip football-bar bench press",
    "Reverse-grip barbell bench press",
    "Reverse-angle football-bar bench press",
    "EZ-bar skullcrusher",
    "Straight-bar skullcrusher",
    "Football-bar skullcrusher",
    "Dumbbell lying triceps extension",
    "Incline skullcrusher",
    "Decline skullcrusher",
    "Close-grip dumbbell press",
    "Upright dips, if dip attachment is available",
    "PJR pullover / PJR triceps extension",
  ],
  back_width: [
    "Front rack chins",
    "Behind-neck rack chins",
    "Reverse-grip close rack chins",
    "Pull-ups",
    "Band-assisted pull-ups",
    "Chin-ups",
    "Wide-grip front pulldown",
    "Medium-grip front pulldown",
    "Close-grip pulldown",
    "Neutral-grip pulldown",
    "Reverse-grip / underhand pulldown",
    "Behind-neck pulldown",
    "One-arm high-pulley pulldown",
    "Dante pulley-row high pull",
  ],
  back_thickness: [
    "Conventional deadlift",
    "Rack deadlift",
    "Trap-bar deadlift",
    "Landmine T-bar row",
    "Overhand barbell row",
    "Underhand barbell row",
    "Football-bar row",
    "Close-neutral seated cable row",
    "Wide-grip seated cable row",
    "Underhand seated cable row",
    "One-arm low-cable row",
    "One-arm dumbbell row",
    "Two-arm dumbbell row",
    "One-arm landmine row",
  ],
  biceps: [
    "Straight-bar curl",
    "EZ-bar curl",
    "Dante drag curl",
    "Standing dumbbell curl",
    "Alternating dumbbell curl",
    "Seated dumbbell curl",
    "Incline dumbbell curl",
    "Low-cable curl",
    "One-arm low-cable curl",
    "Football-bar curl",
    "Preacher-style dumbbell curl, if REP bench setup works",
    "Preacher-style EZ-bar curl, if REP bench setup works",
  ],
  forearms: [
    "Alternating hammer curl",
    "Alternating pinwheel curl",
    "Reverse-grip one-arm cable curl",
    "Reverse EZ-bar curl",
    "Reverse straight-bar curl",
    "Reverse cable curl",
    "Football-bar hammer-style curl",
    "Barbell wrist curl",
    "EZ-bar wrist curl",
    "Dumbbell wrist curl",
    "Cable wrist curl",
  ],
  calves: [
    "Standing barbell calf raise",
    "Standing football-bar calf raise",
    "Standing dumbbell calf raise",
    "Single-leg dumbbell calf raise",
    "Seated dumbbell calf raise",
    "Seated barbell calf raise",
    "Seated football-bar calf raise",
    "Belt-squat calf raise",
  ],
  hamstrings: [
    "Lying Deltech leg curl",
    "Single-leg lying leg curl",
    "Standing cable leg curl, with ankle cuff",
    "Barbell stiff-leg deadlift",
    "Dumbbell stiff-leg deadlift",
    "Football-bar stiff-leg deadlift",
    "Romanian deadlift",
    "Dumbbell Romanian deadlift",
    "Trap-bar RDL / stiff-leg deadlift",
    "Belt-squat RDL / hinge",
  ],
  quadriceps: [
    "Barbell back squat",
    "Barbell front squat",
    "Belt squat",
    "Narrow-stance belt squat",
    "Standard-stance belt squat",
    "Wide-stance belt squat",
    "Wide-stance / sumo belt squat",
    "Barbell hack squat",
    "Leg extension",
  ],
  abs: [
    "High-pulley cable crunch",
    "Weighted decline crunch on REP bench",
    "Hanging leg raise from rack",
    "Lying leg raise on bench",
    "Reverse crunch",
    "Pallof Press",
    "Dead Bug",
    "Bird Dog",
    "Front Plank",
    "Side Plank",
    "Glute Bridge",
  ],
} as const satisfies Record<BodyPart, readonly string[]>;

export type Protocol = "rest_pause" | "straight_set" | "timed_hold";
export type TargetSet = { max: number; min: number };
export type Choice = {
  badge?: "DC";
  info?: string;
  label: string;
  value: string;
};
export type StructureChoice = Choice & { targets?: readonly TargetSet[] };

export function categoryFor(position: AssignmentPosition): BodyPart {
  return position === "abs_1" || position === "abs_2" ? "abs" : position;
}

export function positionsFor(slot: WorkoutSlot): readonly AssignmentPosition[] {
  return slot.startsWith("A")
    ? CORE_BODY_PARTS.A
    : [...CORE_BODY_PARTS.B, "abs_1", "abs_2"];
}

export function positionLabel(position: AssignmentPosition) {
  return position
    .replace("back_", "back ")
    .replace("abs_", "abs ")
    .toUpperCase();
}

export function protocolChoices(
  position: AssignmentPosition,
  exercise = "",
): readonly Choice[] {
  if (categoryFor(position) === "abs")
    return [
      { label: "STRAIGHT SET", value: "straight_set" },
      { label: "TIMED HOLD", value: "timed_hold" },
    ];
  const straightBadge =
    ["back_thickness", "forearms", "calves"].includes(position) ||
    (position === "quadriceps" && exercise !== "Leg extension")
      ? "DC"
      : undefined;
  const restBadge =
    ["chest", "shoulders", "triceps", "back_width", "biceps"].includes(
      position,
    ) ||
    (position === "hamstrings" && /leg curl/i.test(exercise))
      ? "DC"
      : undefined;
  return [
    { badge: restBadge, label: "REST-PAUSE", value: "rest_pause" },
    { badge: straightBadge, label: "STRAIGHT SET", value: "straight_set" },
  ];
}

const genericRestPause: readonly StructureChoice[] = [
  { label: "11–15", value: "11-15", targets: [{ min: 11, max: 15 }] },
  { label: "15–20", value: "15-20", targets: [{ min: 15, max: 20 }] },
  { label: "CUSTOM", value: "custom" },
];

function withBadge(choices: readonly StructureChoice[], value: string) {
  return choices.map((choice) =>
    choice.value === value ? { ...choice, badge: "DC" as const } : choice,
  );
}

export function structureChoices(
  position: AssignmentPosition,
  exercise: string,
  protocol: Protocol,
): readonly StructureChoice[] {
  const bodyPart = categoryFor(position);
  if (bodyPart === "abs") return [];
  if (protocol === "rest_pause") {
    if (
      bodyPart === "triceps" &&
      /skullcrusher|extension|pullover/i.test(exercise)
    )
      return withBadge(
        [
          { label: "11–15", value: "11-15", targets: [{ min: 11, max: 15 }] },
          { label: "15–30", value: "15-30", targets: [{ min: 15, max: 30 }] },
          { label: "CUSTOM", value: "custom" },
        ],
        "15-30",
      );
    if (bodyPart === "hamstrings" && /leg curl/i.test(exercise))
      return withBadge(
        [
          { label: "15–30", value: "15-30", targets: [{ min: 15, max: 30 }] },
          { label: "CUSTOM", value: "custom" },
        ],
        "15-30",
      );
    if (bodyPart === "quadriceps" && exercise === "Leg extension")
      return [{ label: "CUSTOM", value: "custom" }];
    if (bodyPart === "chest" || bodyPart === "back_width")
      return withBadge(genericRestPause, "11-15");
    return genericRestPause;
  }
  if (protocol !== "straight_set") return [];
  if (bodyPart === "back_thickness") {
    return /deadlift/i.test(exercise)
      ? [
          {
            badge: "DC",
            label: "6–8 + 10–12",
            value: "deadlift-6-8-10-12",
            targets: [
              { min: 6, max: 8 },
              { min: 10, max: 12 },
            ],
          },
          { label: "CUSTOM", value: "custom" },
        ]
      : [
          {
            badge: "DC",
            label: "1 × 10–12",
            value: "single-10-12",
            targets: [{ min: 10, max: 12 }],
          },
          { label: "CUSTOM", value: "custom" },
        ];
  }
  if (bodyPart === "forearms")
    return [
      {
        badge: "DC",
        label: "1 × 10–20",
        value: "single-10-20",
        targets: [{ min: 10, max: 20 }],
      },
      { label: "CUSTOM", value: "custom" },
    ];
  if (bodyPart === "calves")
    return [
      {
        badge: "DC",
        info: "Lower slowly over 5 seconds.\nHold the bottom position for 15 seconds.\nExplode upward onto your toes.",
        label: "1 × 10–12",
        value: "single-10-12",
        targets: [{ min: 10, max: 12 }],
      },
      { label: "CUSTOM", value: "custom" },
    ];
  if (bodyPart === "hamstrings" && !/leg curl/i.test(exercise))
    return [
      {
        badge: "DC",
        label: "1 × 10–15",
        value: "single-10-15",
        targets: [{ min: 10, max: 15 }],
      },
      { label: "CUSTOM", value: "custom" },
    ];
  if (bodyPart === "quadriceps") {
    if (exercise === "Leg extension")
      return [{ label: "CUSTOM", value: "custom" }];
    const hack = exercise === "Barbell hack squat";
    return [
      {
        badge: "DC",
        label: hack ? "6–10 + 20" : "4–6 + 20",
        value: hack ? "widowmaker-6-10-20" : "widowmaker-4-6-20",
        targets: hack
          ? [
              { min: 6, max: 10 },
              { min: 20, max: 20 },
            ]
          : [
              { min: 4, max: 6 },
              { min: 20, max: 20 },
            ],
      },
      { label: "CUSTOM", value: "custom" },
    ];
  }
  return [];
}

export function protocolInfo(position: AssignmentPosition, exercise: string) {
  if (position === "chest") return "Classic DC uses one rest-pause work set.";
  if (position === "hamstrings" && !/leg curl/i.test(exercise))
    return "DC handling varies for stiff-leg deadlifts and RDLs.";
  return "";
}
