## 1. Idle daemon behavior

- [x] 1.1 Make `writing-critter run` load and publish an idle state instead of exiting when watch paths or writing apps are not yet configured
- [x] 1.2 Re-evaluate the gate after a successful configuration reload while preserving baseline seeding before newly watched files can count

## 2. Regression coverage

- [x] 2.1 Add focused engine tests proving incomplete configuration keeps the gate closed and performs no scan or document reads
- [x] 2.2 Add a controllable run-loop test proving a no-watch-path startup publishes fresh state and remains successful until intentionally stopped
- [x] 2.3 Add coverage that a path added to an idle running engine is seeded and becomes usable without restarting the service

## 3. Verification and release evidence

- [x] 3.1 Run the affected Python suite and the full automated validation set, including security, lifecycle, manifest, and QML checks
- [x] 3.2 Update release evidence to identify the runtime change, invalidate prior candidate stability evidence, and retain only still-applicable preview/documentation facts
- [x] 3.3 Validate this OpenSpec change strictly and record the implementation results
