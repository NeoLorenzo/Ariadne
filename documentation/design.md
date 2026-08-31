# Ariadne General Design Rules

## 1. Establish a clear visual hierarchy

Each interface should have one obvious primary element.

Use:

- Large, prominent titles
- Smaller muted descriptions
- Medium-weight section headings
- Low-contrast metadata and helper text

Avoid giving labels, descriptions, statuses, and actions equal visual weight.

## 2. Use fewer borders

Do not place bordered containers inside multiple larger bordered containers unless the grouping is necessary.

Prefer:

- Background contrast
- Spacing
- Subtle dividers

Use borders mainly for interactive controls and major surfaces. Excessive outlines make the interface feel rigid and cluttered.

## 3. Use the accent colour selectively

Reserve the purple accent for:

- Primary actions
- Selected states
- Active indicators
- Important progress information

Do not use purple simultaneously for borders, labels, badges, headings, and buttons. Most structural elements should remain neutral.

## 4. Avoid excessive uppercase text

Uppercase should only be used for very small metadata labels or status indicators.

Normal section headings and field labels should use sentence case. Excessive uppercase text makes the interface feel noisy and reduces readability.

## 5. Increase the minimum text size

Do not rely on extremely small text to fit more information.

Recommended minimums:

- Page title: 18–22px
- Modal title: 16–18px
- Body text: 13–14px
- Field labels: 12–13px
- Metadata: 11–12px

Important information should never be presented as tiny metadata.

## 6. Use consistent spacing

Base spacing on a predictable scale such as:

```text
4px, 8px, 12px, 16px, 24px, 32px
```

General rules:

- 4–8px between closely related elements
- 12–16px between fields
- 20–24px between sections
- 24–32px around major containers

Avoid both cramped content and large unexplained empty areas.

## 7. Keep related information visually grouped

Elements that belong together should be close together. Separate unrelated groups using spacing or a divider.

For example:

```text
Title
Description

Primary controls

Divider

Secondary section

Divider

Footer actions
```

Do not present the entire interface as one uninterrupted vertical form.

## 8. Avoid oversized inputs

Input height should match the expected content.

- Short values should use single-line inputs.
- Brief descriptions should use compact text areas.
- Large text areas should only be used when substantial writing is expected.

Do not make every text field visually dominant.

## 9. Reduce persistent helper text

Helper text should clarify something the user may reasonably misunderstand.

It should be:

- Short
- Muted
- Placed directly below the relevant control

Do not permanently display long instructional paragraphs when the interface is already self-explanatory.

## 10. Make primary and secondary actions obvious

Every modal or editing surface should have:

- One clear primary action
- One visually quieter secondary action
- A close control

The primary action should use the accent colour. Secondary actions should use neutral styling.

Avoid presenting two adjacent actions with equal emphasis.

## 11. Keep action placement consistent

Place modal actions in a dedicated footer aligned to the bottom-right.

Use the same order throughout the application:

```text
Cancel | Primary action
```

Do not place important actions unpredictably throughout the content.

## 12. Use dividers to structure dense interfaces

Subtle horizontal dividers can separate:

- Main information
- Settings
- Nested items
- Metadata
- Footer actions

A divider is often cleaner than wrapping every section in another card.

## 13. Avoid large containers with sparse content

Containers should fit their contents rather than stretching across the available space without purpose.

For desktop layouts:

- Apply sensible maximum widths
- Use columns or grids where appropriate
- Let small cards remain compact
- Avoid leaving most of a bordered section empty

## 14. Keep cards focused

A card should represent one coherent concept.

A compact card should generally contain:

- Title
- One short description or status
- Essential progress or metadata
- One primary contextual action
- Optional overflow menu

Do not place every possible action and detail directly on the card.

## 15. Move secondary actions into overflow menus

Actions such as:

- Archive
- Pause
- Delete
- View history
- Reorder

should usually live in a `•••` menu unless they are frequently used.

Keep only the most common action visible.

## 16. Use status badges sparingly

Status badges should be compact and visually quiet.

They should not compete with the title. Use restrained backgrounds or outlines rather than saturated colours unless the status requires urgent attention.

## 17. Keep progress displays simple

Progress should use:

- One progress bar
- One percentage or count
- A short label

Avoid presenting the same progress information several times in slightly different forms.

## 18. Prefer progressive disclosure

Initially show only the information needed to understand and act.

Place further details behind:

- Expandable sections
- Detail views
- Modals
- Overflow menus

The default interface should remain easy to scan.

## 19. Use consistent control styling

Inputs, selects, buttons, text areas, and date controls should share:

- Border colour
- Corner radius
- Height
- Typography
- Focus state
- Background colour

Avoid controls that appear to come from separate design systems.

## 20. Use one corner-radius system

Choose a small set of radii, for example:

```text
Controls: 6px
Cards: 8px
Modals: 12px
```

Do not mix many unrelated levels of roundness.

## 21. Use semantic emphasis instead of decorative emphasis

Emphasize information because it is important, not merely to decorate the interface.

Before adding a border, colour, badge, or heading, determine what distinction it communicates. Remove visual treatment that communicates nothing.

## 22. Optimize for scanning

A user should be able to identify within seconds:

- What this interface is for
- What the most important information is
- What action is available
- What happens next

Use alignment, spacing, typography, and concise wording to make this possible.

## 23. Maintain a restrained dark theme

Use several subtle surface levels rather than pure black everywhere:

```text
Application background
Primary surface
Elevated surface
Interactive control
Hover state
```

Keep contrast sufficient, but avoid highly visible borders around every surface.

## 24. Prefer calm density

The interface should be compact without feeling compressed.

Aim for:

- Fewer decorative elements
- Moderate spacing
- Short labels
- Compact controls
- Clear grouping
- Strong title hierarchy

The target is not minimal content. It is minimal visual friction.

## 25. Hide default states

Do not show labels for the normal state of an object. If objectives are active by default, remove the repeated `Active` text and status dot.

Only display status when it communicates an exception that requires attention, such as:

- `Paused`
- `Completed`
- `Archived`
- `At risk`

## 26. Keep progress attached to what it measures

A progress bar must appear directly beside or beneath the goal it represents.

Keep the goal title, progress percentage, and progress bar within one compact visual group. Do not place the goal on the left side of the row and its progress on the opposite edge of the screen, as this makes them appear unrelated.

## 27. Group related information instead of filling available width

A full-width row does not require its contents to be spread across the entire viewport.

Keep related elements in compact clusters with consistent spacing. Large empty gaps should separate sections, not individual pieces of information that belong together.

## 28. Create clear hierarchy between objectives and goals

The objective should remain the primary element, followed by its description and then its current or next goal.

Use differences in font size, weight, contrast, and spacing to make this structure immediately understandable. Goal metadata and progress should look subordinate to the objective without becoming visually disconnected from it.

## 29. Remove repetitive metadata

Do not repeat information that is already implied by context.

Labels such as `Active`, `1 active goal`, and `Next` should only appear when they provide useful distinction. Prefer simpler wording such as `1 goal`, or omit the count entirely when the interface already makes the relationship clear.

# Modal Design Rules

## 1. Do not repeat the action that opened the modal

The user already knows why the modal appeared. Avoid large headings such as:

- Add strategic objective
- Create new task
- Edit project

Begin directly with the primary content field instead.

Example:

```text
Objective title
Add context or describe the intended change
```

The primary button can retain the explicit action, such as **Add objective**.

## 2. Make the primary field the visual heading

The title input should function as both the modal heading and the editable field.

It should:

- Appear at the top
- Use larger, heavier text
- Receive focus automatically
- Have minimal or no surrounding border
- Use descriptive placeholder text such as `Objective title`

The user should feel as though they are editing the object directly, not completing a form.

## 3. Build obvious labels into fields

Avoid placing a label above every input when the field can explain itself.

Instead of:

```text
Title
[                           ]
```

Use:

```text
[ Objective title           ]
```

Instead of:

```text
Description — Optional
[                           ]
```

Use:

```text
[ Add a description         ]
```

External labels should be reserved for fields whose meaning would become unclear once filled.

## 4. Use prompts rather than technical property names

Field text should explain what the user should enter, not merely name the database property.

Prefer:

- `What does success look like?`
- `When should this objective be considered complete?`
- `Add relevant context`
- `Estimate duration`

Avoid unnecessarily abstract labels such as:

- Success condition
- Objective description
- Completion criteria

## 5. Establish hierarchy through typography

The modal should have a clear reading order:

1. Primary title
2. Supporting description
3. Important configuration
4. Secondary sections
5. Footer actions

Use font size, weight and contrast to create this hierarchy. Do not give every field and label equal visual emphasis.

## 6. Reduce bordered form controls

Too many outlined inputs make a modal feel like an administrative form.

Use borders selectively:

- Minimal treatment for title and description fields
- Subtle backgrounds or separators for large text areas
- Bordered controls for discrete selections such as dates, status and dropdowns
- Dividers between conceptual sections

Avoid placing every element inside its own prominent rectangle.

## 7. Group related controls into compact rows

Small configuration controls should be visually subordinate to the main content.

Related controls such as these can share a row:

- Date
- Time
- Status
- Priority
- Estimate
- Category

Use concise control text and consistent heights. Do not create a full-width section for a single simple dropdown.

## 8. Separate concepts with spacing and dividers

Use spacing to show relationships and dividers to mark major transitions.

A typical modal structure should be:

```text
Primary content

────────────────────

Configuration or secondary content

────────────────────

Footer actions
```

Do not rely on nested cards and borders to separate every region.

## 9. Keep optional information visually quiet

Optional fields should not compete with required content.

Prefer muted placeholders such as:

- `Add a description`
- `Add notes`
- `Add supporting context`

Where explicit wording is required, use a subtle suffix:

```text
Description · Optional
```

Do not give `Optional` the same prominence as the field name.

## 10. Use progressive disclosure

Show only the controls most users need immediately.

Less common options should appear through:

- Expandable sections
- Dropdown menus
- “More options” controls
- Contextual controls revealed after relevant choices

The initial modal should remain fast to scan and complete.

## 11. Keep actions in a stable footer

Modal actions should remain predictable:

- Secondary action on the left of the action group
- Primary action on the far right
- Clear visual emphasis on the primary action
- Footer separated from the content with a divider

Example:

```text
                         Cancel   Add objective
```

Avoid placing primary actions in multiple locations.

## 12. Use concise and specific button labels

The primary button should describe the resulting action:

- Add objective
- Add task
- Save changes
- Create project

Avoid generic labels such as:

- Submit
- Confirm
- Done

Use **Cancel** consistently for the secondary action.

## 13. Keep the close control secondary

The close icon should remain small and visually muted. It should not compete with the primary content or footer buttons.

Use a close icon only when the modal does not already provide a **Cancel** action. Pressing Escape should behave consistently with whichever dismissal action is present.

## 14. Match complexity to the object being created

A simple object should have a simple modal. Additional fields should only appear when they materially affect the object.

Do not expose implementation details or every available property by default. The modal should support the user’s decision-making process rather than mirror the database schema.

## 15. Maintain consistent modal anatomy across the application

All creation and editing modals should share:

- Similar padding
- Identical corner radii
- Consistent footer placement
- Consistent button styles
- Consistent divider treatment
- Similar title and description hierarchy
- Standard control heights

Different modals may contain different functionality, but they should clearly belong to the same application.

## 16. Use disclosure controls only for meaningful groups

An expandable section or **More options** control should reveal at least three distinct additional settings or actions.

If only one or two additional items exist, display them directly in the modal at the appropriate level of the hierarchy. Do not add interaction and nesting when it does not materially simplify the initial view.

## 17. Provide one visible dismissal action

Do not show multiple visible controls that perform the same dismissal.

A form modal with a **Cancel** action should not also include a close icon. An informational modal without footer actions may use a close icon instead.

Escape and backdrop behaviour may support the same dismissal without adding another visible button.
