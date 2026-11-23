# The course catalog marks an Enrollment, not a Purchase

On `/courses`, a Student asked to see which courses they had already bought (ticket #66). The card marks the viewer's Enrollment, not their Purchase. An Enrollment is what lets a Student take the course, and it comes from either an Individual Purchase or a Claimed Seat (ADR-0004). Each card gets at most one badge, in this order:

1. **Your Course** when the viewer is the course's Instructor, even if they also have an Enrollment.
2. **Locked** when the viewer has an Enrollment but Country Lock stops them taking the course.
3. **Enrolled** for any other Enrollment.

A Team Licence on its own gets no badge, because it grants Seats, not an Enrollment. A Lapsed Student gets no badge either.

The **Owned** filter lists the courses the viewer has an Enrollment on, including Locked ones. It is shown only to a signed-in viewer and is ignored for a signed-out one.

## Consequences

A Team Admin who bought a Team Licence and never claimed a Seat sees nothing on that course's card, even though they paid for it.
