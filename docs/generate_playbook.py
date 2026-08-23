import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super(NumberedCanvas, self).showPage()
        super(NumberedCanvas, self).save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        
        # Color definitions
        indigo = colors.HexColor("#4F46E5")
        charcoal = colors.HexColor("#0F172A")
        slate = colors.HexColor("#475569")
        light_gray = colors.HexColor("#E2E8F0")

        # Top Header (Only on Page 2, 3, 4)
        if self._pageNumber > 1:
            self.setFont("Helvetica-Bold", 8)
            self.setFillColor(indigo)
            self.drawString(54, 755, "FLOWTRACE — 3-MINUTE JUDGE DEMO PLAYBOOK")
            self.setFont("Helvetica", 8)
            self.setFillColor(slate)
            self.drawRightString(558, 755, "INTERNAL TEAM RUNBOOK")
            self.setStrokeColor(light_gray)
            self.setLineWidth(0.5)
            self.line(54, 747, 558, 747)

        # Bottom Footer (All Pages)
        self.setStrokeColor(light_gray)
        self.setLineWidth(0.5)
        self.line(54, 40, 558, 40)
        
        self.setFont("Helvetica", 7.5)
        self.setFillColor(slate)
        self.drawString(54, 28, "Confidential — Internal Hackathon Material")
        self.drawRightString(558, 28, f"Page {self._pageNumber} of {page_count}")
        
        self.restoreState()

def build_pdf(filename="flowtrace_demo_playbook.pdf"):
    # Letter size: 612 x 792 points. Margins: 0.75" (54 points) left/right, 0.75" (54 points) top/bottom.
    # Usable width: 612 - 108 = 504 pt. Height: 792 - 108 = 684 pt.
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()
    
    # Custom Palette
    indigo = colors.HexColor("#4F46E5")
    charcoal = colors.HexColor("#0F172A")
    slate = colors.HexColor("#475569")
    bg_light = colors.HexColor("#F8FAFC")
    bg_card = colors.HexColor("#FFFFFF")
    border_color = colors.HexColor("#E2E8F0")
    error_color = colors.HexColor("#B91C1C")
    error_bg = colors.HexColor("#FEF2F2")

    # Custom Styles
    styles.add(ParagraphStyle(
        name='MainTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=indigo,
        spaceAfter=4
    ))
    
    styles.add(ParagraphStyle(
        name='Subtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=14,
        textColor=slate,
        spaceAfter=16
    ))
    
    styles.add(ParagraphStyle(
        name='PageHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=18,
        textColor=charcoal,
        spaceAfter=8
    ))

    styles.add(ParagraphStyle(
        name='PageHeaderIndigo',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=18,
        textColor=indigo,
        spaceAfter=8
    ))

    styles.add(ParagraphStyle(
        name='SectionHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=12,
        textColor=charcoal,
        spaceBefore=6,
        spaceAfter=4
    ))

    styles.add(ParagraphStyle(
        name='StepTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=13,
        textColor=charcoal,
        spaceAfter=4
    ))

    styles.add(ParagraphStyle(
        name='PlaybookBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=charcoal
    ))

    styles.add(ParagraphStyle(
        name='LabelText',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9,
        textColor=slate
    ))

    styles.add(ParagraphStyle(
        name='ValueText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        textColor=charcoal
    ))

    styles.add(ParagraphStyle(
        name='CodeText',
        parent=styles['Normal'],
        fontName='Courier-Bold',
        fontSize=8,
        leading=10,
        textColor=indigo
    ))

    styles.add(ParagraphStyle(
        name='SayText',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=8.5,
        leading=12,
        textColor=indigo
    ))

    styles.add(ParagraphStyle(
        name='WarningHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=11,
        textColor=error_color,
        spaceAfter=2
    ))

    styles.add(ParagraphStyle(
        name='WarningBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10.5,
        textColor=error_color
    ))

    story = []

    # ─────────────────────────────────────────────────────────────────────────
    # PAGE 1 — THE DEMO AT A GLANCE
    # ─────────────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 20))
    story.append(Paragraph("FLOWTRACE", styles['MainTitle']))
    story.append(Paragraph("3-MINUTE JUDGE DEMO PLAYBOOK", styles['Subtitle']))
    
    # Path Flow Diagram
    path_data = [
        [
            Paragraph("<b>OPEN</b><br/><font size=6.5 color='#94A3B8'>http://localhost:5173</font>", styles['LabelText']),
            Paragraph("<b>➔</b>", styles['LabelText']),
            Paragraph("<b>SELECT WORKFLOW</b><br/><font size=6.5 color='#94A3B8'>Asset Request Process</font>", styles['LabelText']),
            Paragraph("<b>➔</b>", styles['LabelText']),
            Paragraph("<b>SHOW DAG</b><br/><font size=6.5 color='#94A3B8'>React Flow Canvas</font>", styles['LabelText']),
            Paragraph("<b>➔</b>", styles['LabelText']),
            Paragraph("<b>INSPECT NODE</b><br/><font size=6.5 color='#94A3B8'>approved-action</font>", styles['LabelText']),
            Paragraph("<b>➔</b>", styles['LabelText']),
            Paragraph("<b>SAFE CHANGE</b><br/><font size=6.5 color='#94A3B8'>redirect ➔ skip</font>", styles['LabelText'])
        ],
        [
            Paragraph("<b>CLOSE</b><br/><font size=6.5 color='#4F46E5'>Strong Finishing Line</font>", styles['LabelText']),
            Paragraph("<b>➔</b>", styles['LabelText']),
            Paragraph("<b>SHOW LOGS</b><br/><font size=6.5 color='#94A3B8'>Real-time Steps</font>", styles['LabelText']),
            Paragraph("<b>➔</b>", styles['LabelText']),
            Paragraph("<b>RUN</b><br/><font size=6.5 color='#94A3B8'>Execute Manual Run</font>", styles['LabelText']),
            Paragraph("<b>➔</b>", styles['LabelText']),
            Paragraph("<b>APPROVE + PUBLISH</b><br/><font size=6.5 color='#94A3B8'>Approve &amp; Publish</font>", styles['LabelText']),
            Paragraph("<b>➔</b>", styles['LabelText']),
            Paragraph("<b>REVIEW PATCH</b><br/><font size=6.5 color='#94A3B8'>Patch Preview Diff</font>", styles['LabelText'])
        ]
    ]
    
    path_table = Table(path_data, colWidths=[90, 13, 90, 13, 90, 13, 90, 13, 90])
    path_table.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BACKGROUND', (0,0), (0,0), bg_light),
        ('BACKGROUND', (2,0), (2,0), bg_light),
        ('BACKGROUND', (4,0), (4,0), bg_light),
        ('BACKGROUND', (6,0), (6,0), bg_light),
        ('BACKGROUND', (8,0), (8,0), bg_light),
        ('BACKGROUND', (0,1), (0,1), colors.HexColor("#E0E7FF")),
        ('BACKGROUND', (2,1), (2,1), bg_light),
        ('BACKGROUND', (4,1), (4,1), bg_light),
        ('BACKGROUND', (6,1), (6,1), bg_light),
        ('BACKGROUND', (8,1), (8,1), bg_light),
        ('INNERGRID', (0,0), (0,0), 0.5, border_color),
        ('INNERGRID', (2,0), (2,0), 0.5, border_color),
        ('INNERGRID', (4,0), (4,0), 0.5, border_color),
        ('INNERGRID', (6,0), (6,0), 0.5, border_color),
        ('INNERGRID', (8,0), (8,0), 0.5, border_color),
        ('INNERGRID', (0,1), (0,1), 0.5, indigo),
        ('INNERGRID', (2,1), (2,1), 0.5, border_color),
        ('INNERGRID', (4,1), (4,1), 0.5, border_color),
        ('INNERGRID', (6,1), (6,1), 0.5, border_color),
        ('INNERGRID', (8,1), (8,1), 0.5, border_color),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 2),
        ('RIGHTPADDING', (0,0), (-1,-1), 2),
    ]))
    
    story.append(path_table)
    story.append(Spacer(1, 16))

    # Meta Table
    meta_data = [
        [Paragraph("TOTAL TIME", styles['LabelText']), Paragraph("<b>2–3 MINUTES MAXIMUM</b>", styles['ValueText'])],
        [Paragraph("SAVED WORKFLOW", styles['LabelText']), Paragraph("<b>Asset Request Approval Process</b> (wf_asset_request_approval)", styles['CodeText'])],
        [Paragraph("DEMO GOAL", styles['LabelText']), Paragraph("Prove that FlowTrace turns plain-English requirements into a visual, executable DAG, allows safe sandboxed modifications, enforces multi-step verification (Zod validation + explicit human approval), and tracks immutable execution history.", styles['ValueText'])]
    ]
    meta_table = Table(meta_data, colWidths=[110, 394])
    meta_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LINEBELOW', (0,0), (-1,-2), 0.5, border_color),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 16))

    # Intro Speech Box
    intro_speech = (
        "<b>Presenter Pitch:</b><br/>"
        "\"In modern systems, business flows are often hard-coded across backend services, making them "
        "impossible to audit or safely modify. FlowTrace solves this by converting plain-English requirements "
        "into visual, executable, and safely versioned workflows. Let's see how this works in 3 minutes.\""
    )
    
    intro_table = Table([[Paragraph(intro_speech, styles['SayText'])]], colWidths=[504])
    intro_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,0), bg_light),
        ('BOX', (0,0), (0,0), 1, indigo),
        ('TOPPADDING', (0,0), (0,0), 10),
        ('BOTTOMPADDING', (0,0), (0,0), 10),
        ('LEFTPADDING', (0,0), (0,0), 12),
        ('RIGHTPADDING', (0,0), (0,0), 12),
    ]))
    story.append(intro_table)
    
    # Reset note
    story.append(Spacer(1, 20))
    story.append(Paragraph("<b>NOTE:</b> This guide is tailored for the <b>Asset Request Approval Process</b>, "
                           "which includes a dynamic conditional branch (eq/neq checks) and an error recovery redirect target "
                           "that perfectly illustrates the core capabilities of the FlowTrace engine.", styles['PlaybookBody']))

    story.append(PageBreak())

    # ─────────────────────────────────────────────────────────────────────────
    # PAGE 2 — EXACT CLICK-BY-CLICK DEMO (PART 1)
    # ─────────────────────────────────────────────────────────────────────────
    story.append(Paragraph("FOLLOW THESE STEPS", styles['PageHeader']))
    story.append(Spacer(1, 4))

    def make_step_table(step_num, time, title, click_list, show_text, say_text, why_text):
        clicks = "<br/>".join([f"{i+1}. {c}" for i, c in enumerate(click_list)])
        step_html = (
            f"<font color='#4F46E5'><b>STEP {step_num}</b></font> | "
            f"<font color='#0F172A'><b>{title}</b></font> | "
            f"<font color='#475569'><i>TIME: {time}</i></font>"
        )
        content_table_data = [
            [Paragraph("<b>CLICK:</b>", styles['LabelText']), Paragraph(clicks, styles['ValueText'])],
            [Paragraph("<b>SHOW:</b>", styles['LabelText']), Paragraph(show_text, styles['ValueText'])],
            [Paragraph("<b>SAY:</b>", styles['LabelText']), Paragraph(f"\"{say_text}\"", styles['SayText'])],
            [Paragraph("<b>WHY:</b>", styles['LabelText']), Paragraph(why_text, styles['ValueText'])]
        ]
        t = Table(content_table_data, colWidths=[50, 422])
        t.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 3),
            ('TOPPADDING', (0,0), (-1,-1), 3),
            ('LINEBELOW', (0,0), (-1,-2), 0.5, border_color),
        ]))
        
        main_table_data = [
            [Paragraph(step_html, styles['StepTitle'])],
            [t]
        ]
        
        outer = Table(main_table_data, colWidths=[496])
        outer.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), bg_card),
            ('BOX', (0,0), (-1,-1), 0.5, border_color),
            ('TOPPADDING', (0,0), (-1,-1), 6),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
            ('LEFTPADDING', (0,0), (-1,-1), 10),
            ('RIGHTPADDING', (0,0), (-1,-1), 10),
        ]))
        return outer

    # Step 1
    s1 = make_step_table(
        1, "0:00–0:20", "OPEN THE SAVED WORKFLOW",
        [
            "Open your browser and navigate to <b>http://localhost:5173</b>",
            "Locate <b>Asset Request Approval Process</b> in the workflow list.",
            "Click on the workflow card to open it."
        ],
        "The selected workflow page loads, rendering the React Flow DAG canvas and the Trigger panel.",
        "Here we have the Asset Request Approval Process workflow. FlowTrace gives teams instant visual clarity over complex operations instead of leaving them hidden in code.",
        "Demonstrates real-time workflow database synchronization and immediate React Flow DAG visualization."
    )
    story.append(s1)
    story.append(Spacer(1, 8))

    # Step 2
    s2 = make_step_table(
        2, "0:20–0:50", "INSPECT THE GRAPH VARIABLES",
        [
            "Locate the dashed edges labeled <b>eq</b> and <b>neq</b>.",
            "Click on the node labeled <b>approved-action</b> (Post Approved Asset) on the canvas.",
            "Inspect the <b>Node Configurator</b> panel on the right."
        ],
        "The right-hand side panel updates to display the Node ID, API Action, and inputs payload.",
        "FlowTrace maps execution conditions directly to edges. Looking at the approved-action node, we see it runs Slack.post and includes a failure recovery policy that automatically routes errors to a redirect handler.",
        "Illustrates conditional branch handling (eq/neq true) and error recovery configurations directly on the DAG."
    )
    story.append(s2)
    story.append(Spacer(1, 8))

    # Step 3
    s3 = make_step_table(
        3, "0:50–1:15", "ENTER DRAFT SANDBOX MODE",
        [
            "Locate the view mode toggle tabs above the canvas grid.",
            "Click the <b>Draft Sandbox</b> button to leave the immutable published view."
        ],
        "The interface switches into sandboxed draft state. An orange 'Draft Sandbox' warning badge appears.",
        "To ensure live workflows are never broken, changes are isolated in a local sandboxed draft. The live system continues to run the published version while we build.",
        "Highlights the safety separation between the immutable live execution engine and the editing draft sandbox."
    )
    story.append(s3)
    
    story.append(PageBreak())

    # ─────────────────────────────────────────────────────────────────────────
    # PAGE 3 — THE POWERFUL PART
    # ─────────────────────────────────────────────────────────────────────────
    story.append(Paragraph("SHOW THE SAFETY STORY", styles['PageHeaderIndigo']))
    story.append(Spacer(1, 4))

    # Step 4
    s4 = make_step_table(
        4, "1:15–1:35", "MAKE A SAFE CHANGE",
        [
            "With the canvas in <b>Draft Sandbox</b> mode, click the <b>approved-action</b> node again.",
            "In the right editor, scroll to <b>Failure Recovery Policy</b>.",
            "Change the <b>Failure Action</b> dropdown from 'redirect' to 'skip' (Skip Step).",
            "Click the blue <b>Apply Edits to Draft</b> button at the bottom of the editor."
        ],
        "The node inputs show a success message: 'Changes applied to local draft sandbox successfully!'.",
        "We are changing the failure policy of the approved-action node. If this step fails on live execution, it will now gracefully skip instead of aborting or redirecting.",
        "Proves manual edit safety and dynamic local draft modification validation."
    )
    story.append(s4)
    story.append(Spacer(1, 8))

    # Step 5
    s5 = make_step_table(
        5, "1:35–1:55", "REVIEW THE DRAFT PATCH DIFF",
        [
            "Look below the Node Configurator to find the <b>Patch Preview</b> card.",
            "Inspect the list of changes displayed with color-coded badges."
        ],
        "The Patch Preview shows one update: 'Node Update: approved-action' with the details: 'Failure Policy: redirect ➔ skip'.",
        "FlowTrace computes the precise difference between the published baseline and our sandbox. This structured change proposal is validated against our schemas before submission.",
        "Shows how changes are validated and represented as structured JSON patches rather than unverified code."
    )
    story.append(s5)
    story.append(Spacer(1, 8))

    # Step 6
    s6 = make_step_table(
        6, "1:55–2:15", "APPROVE AND PUBLISH THE DRAFT",
        [
            "Ensure the validation badge displays a clean state.",
            "Check the <b>Approve draft</b> checkbox under the action bar.",
            "Click the green <b>Approve & Publish Draft</b> button."
        ],
        "A success banner appears: 'Published version 2 of workflow Asset Request Approval Process'. The view returns to the Published tab.",
        "We verify our draft, sign off with an explicit human-in-the-loop approval, and publish it. The change is promoted to version 2, and the execution engine updates its pointer.",
        "Demonstrates stale-edit protection, shared graph validation, and human-in-the-loop promotion control."
    )
    story.append(s6)

    story.append(PageBreak())

    # ─────────────────────────────────────────────────────────────────────────
    # PAGE 4 — RUN + FINAL CLOSE
    # ─────────────────────────────────────────────────────────────────────────
    story.append(Paragraph("RUN IT AND FINISH STRONG", styles['PageHeader']))
    story.append(Spacer(1, 4))

    # Step 7
    s7 = make_step_table(
        7, "2:15–2:40", "RUN WORKFLOW & SHOW LOGS",
        [
            "With the view tab returned to <b>Published Version (2)</b>, locate the <b>Trigger Manual Run</b> card.",
            "Fill out the form fields:<br/>"
            "   • Request ID: <b>REQ-100</b><br/>"
            "   • Approved: <b>Checked</b> (set to true)<br/>"
            "   • Request Amount: <b>1500</b>",
            "Click the blue <b>Execute Manual Run</b> button."
        ],
        "The Live Run Execution overlay modal slides in. The approval step and the newly modified approved-action step light up green in sequence.",
        "FlowTrace executes the workflow, passing inputs between steps. In the Live Log overlay, we see the steps progressing in topological order, successfully applying our new configuration.",
        "Validates the execution engine's template context resolution and real-time execution logger."
    )
    story.append(s7)
    story.append(Spacer(1, 10))

    # Closing Speech Box
    closing_speech = (
        "<b>Final 15-Second Closing:</b><br/>"
        "\"FlowTrace does not just generate workflows. It provides an enterprise-ready framework that "
        "makes automation safe. By combining natural language generation, strict schema validation, visual diffs, "
        "and human-in-the-loop approvals, we ensure that changing workflows is completely risk-free. Thank you!\""
    )
    closing_table = Table([[Paragraph(closing_speech, styles['SayText'])]], colWidths=[496])
    closing_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,0), colors.HexColor("#E0E7FF")),
        ('BOX', (0,0), (0,0), 1, indigo),
        ('TOPPADDING', (0,0), (0,0), 8),
        ('BOTTOMPADDING', (0,0), (0,0), 8),
        ('LEFTPADDING', (0,0), (0,0), 12),
        ('RIGHTPADDING', (0,0), (0,0), 12),
    ]))
    story.append(closing_table)
    story.append(Spacer(1, 10))

    # Warnings / Reset / Checklist Grid
    bottom_data = [
        [
            Paragraph("<b>DO NOT DO THIS:</b>", styles['WarningHeader']),
            Paragraph("<b>BEFORE THE JUDGES ARRIVE:</b>", styles['SectionHeader']),
            Paragraph("<b>DEMO CHECKLIST:</b>", styles['SectionHeader'])
        ],
        [
            Paragraph(
                "• Do NOT create new workflows during the demo.<br/>"
                "• Do NOT run edits in the published tab.<br/>"
                "• Do NOT click nodes other than approved-action.<br/>"
                "• Do NOT change trigger schemas.<br/>"
                "• Do NOT open the terminal or look at DB files.<br/>"
                "• Keep the speech focused on safety, not code.",
                styles['WarningBody']
            ),
            Paragraph(
                "1. Terminate any running servers.<br/>"
                "2. Run: <font face='Courier' size=7><b>pnpm demo:reset</b></font><br/>"
                "3. Start: <font face='Courier' size=7><b>pnpm dev</b></font><br/>"
                "4. Open: <b>http://localhost:5173</b><br/>"
                "5. Select: <b>Asset Request Approval Process</b><br/>"
                "6. Make sure base version is 1.",
                styles['ValueText']
            ),
            Paragraph(
                "<b>BEFORE:</b><br/>"
                "☐ App runs on port 5173<br/>"
                "☐ MongoDB is connected<br/>"
                "☐ Demo data is freshly seeded<br/>"
                "<b>DURING:</b><br/>"
                "☐ Show DAG edges &amp; conditions<br/>"
                "☐ Switch to Draft Sandbox<br/>"
                "☐ Apply edits ➔ check patch diff<br/>"
                "☐ Approve ➔ Publish v2<br/>"
                "☐ Run workflow ➔ inspect logs",
                styles['ValueText']
            )
        ]
    ]
    
    bottom_table = Table(bottom_data, colWidths=[165, 165, 166])
    bottom_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BACKGROUND', (0,0), (0,1), error_bg),
        ('BOX', (0,0), (0,1), 0.5, error_color),
        ('BACKGROUND', (1,0), (2,1), bg_light),
        ('BOX', (1,0), (2,1), 0.5, border_color),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    
    story.append(bottom_table)

    # Build the document
    doc.build(story, canvasmaker=NumberedCanvas)

if __name__ == "__main__":
    output_path = "C:\\Users\\brije\\Documents\\flowtrace\\docs\\flowtrace_demo_playbook.pdf"
    build_pdf(output_path)
    print(f"Playbook generated successfully at: {output_path}")
