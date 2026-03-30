"""
Génération des grilles OMR en PDF - Format A4 — UNE SEULE PAGE garantie.

Algorithme d'auto-fit :
  1. Calculer la hauteur disponible après l'en-tête
  2. Tester les nombres de colonnes (2 → 8) pour trouver la plus grande
     taille de case qui tient en hauteur ET en largeur
  3. Appliquer les limites physiques : MAX 60q avec remord, 120q sans

Repère : ReportLab Y=0 en bas de page, Y=H en haut.
"""

import math, os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib import colors

W, H = A4

MARGIN_X     = 13 * mm
MARGIN_Y     = 13 * mm

CROSS_R      = 3.0 * mm
CROSS_WEIGHT = 1.0

ID_BOX   = 3.5 * mm
ID_GAP   = 0.7 * mm
ID_VGAP  = 0.6 * mm
ID_LABEL = 4.0 * mm

MAX_Q_REMORSE    = 60
MAX_Q_NO_REMORSE = 120
MIN_BOX    = 3.0 * mm
MAX_BOX    = 5.5 * mm
GAP_RATIO  = 0.28
ROW_GAP    = 0.9 * mm
Q_GAP      = 1.5 * mm
GROUP_SEP  = 1.0 * mm
COL_MARGIN = 3.0 * mm
NUM_W      = 8.5 * mm


def _box(c, x, y, size, lw=0.7):
    c.setLineWidth(lw)
    c.setStrokeColor(colors.black)
    c.setFillColor(colors.white)
    c.rect(x, y - size, size, size, stroke=1, fill=1)


def _cross(c, cx, cy):
    c.setLineWidth(CROSS_WEIGHT)
    c.setStrokeColor(colors.black)
    c.circle(cx, cy, CROSS_R, stroke=1, fill=0)
    arm = CROSS_R * 1.5
    c.line(cx - arm, cy, cx + arm, cy)
    c.line(cx, cy - arm, cx, cy + arm)


def _crosses(c):
    off = MARGIN_X * 0.75
    for px, py in [(off, H-off), (W-off, H-off), (off, off), (W-off, off)]:
        _cross(c, px, py)


def draw_header(c, title, institution):
    top = H - CROSS_R * 2 - 6*mm

    c.setFont("Helvetica-Bold", 13)
    c.setFillColor(colors.black)
    c.drawCentredString(W/2, top, title)
    c.setFont("Helvetica-Bold", 10)
    c.drawCentredString(W/2, top - 7*mm, institution)

    id_top = top - 5*mm
    id_x   = MARGIN_X + 1*mm
    cell_h = ID_BOX + ID_VGAP
    cell_w = ID_BOX + ID_GAP

    c.setFont("Helvetica", 5.5)
    c.setFillColor(colors.black)
    c.drawString(id_x + ID_LABEL, id_top + 1.5*mm, "Saisir votre numéro d'étudiant")

    write_y = id_top - cell_h + ID_VGAP/2
    for col in range(5):
        bx = id_x + ID_LABEL + col * cell_w
        c.setLineWidth(0.7)
        c.setStrokeColor(colors.black)
        c.setFillColor(colors.white)
        c.rect(bx, write_y - ID_BOX, cell_w - 0.4*mm, ID_BOX, stroke=1, fill=1)

    for row in range(10):
        ry = id_top - cell_h - (row + 1) * cell_h + ID_VGAP/2
        c.setFont("Helvetica", 5.5)
        c.setFillColor(colors.black)
        c.drawRightString(id_x + ID_LABEL - 0.8*mm, ry - ID_BOX/2 - 0.7*mm, str(row))
        for col in range(5):
            _box(c, id_x + ID_LABEL + col * cell_w, ry, ID_BOX)

    id_bottom = id_top - cell_h - 10 * cell_h - 1*mm

    id_zone_w = ID_LABEL + 5 * cell_w + 4*mm
    col2_x    = MARGIN_X + id_zone_w + 4*mm
    field_w   = W - col2_x - MARGIN_X
    lab_w     = 18*mm
    box_h     = 7*mm
    box_w     = field_w - lab_w
    nom_top   = id_top - 3*mm

    c.setFont("Helvetica-Bold", 8.5)
    c.setFillColor(colors.black)
    c.drawString(col2_x, nom_top - box_h/2 + 1.2*mm, "Nom :")
    c.setLineWidth(0.6); c.setStrokeColor(colors.black); c.setFillColor(colors.white)
    c.rect(col2_x + lab_w, nom_top - box_h, box_w, box_h, stroke=1, fill=1)

    prenom_top = nom_top - box_h - 3*mm
    c.setFont("Helvetica-Bold", 8.5)
    c.setFillColor(colors.black)
    c.drawString(col2_x, prenom_top - box_h/2 + 1.2*mm, "Prénom :")
    c.setStrokeColor(colors.black); c.setFillColor(colors.white)
    c.rect(col2_x + lab_w, prenom_top - box_h, box_w, box_h, stroke=1, fill=1)

    c.setFont("Helvetica-Oblique", 6.5)
    c.setFillColor(colors.black)
    c.drawCentredString(col2_x + field_w/2, prenom_top - box_h - 5*mm,
                        "Ne pas écrire en dehors de ce cadre")

    sep_y = id_bottom - 3*mm
    c.setLineWidth(0.4); c.setStrokeColor(colors.black)
    c.line(MARGIN_X, sep_y, W - MARGIN_X, sep_y)

    c.setFont("Helvetica-Oblique", 8)
    c.setFillColor(colors.black)
    c.drawCentredString(W/2, sep_y - 5.5*mm, "Répondre aux questions en noircissant les cases")

    return sep_y - 12*mm


def _compute_layout(nb_q, nb_choices, has_remorse, avail_h, avail_w):
    best = None
    for n_cols in range(2, 9):
        q_per_col = math.ceil(nb_q / n_cols)
        n_seps    = q_per_col // 5
        header_row = 3.5 * mm
        fixed_v = (header_row
                   + n_seps * GROUP_SEP
                   + Q_GAP * q_per_col
                   + ROW_GAP * int(has_remorse) * q_per_col)
        rows_per_q = 1 + int(has_remorse)
        denom_h = rows_per_q * q_per_col
        if denom_h == 0:
            continue
        box_from_h = (avail_h - fixed_v) / denom_h

        col_sp  = avail_w / n_cols
        usable  = col_sp - NUM_W - COL_MARGIN
        if usable <= 0:
            continue
        box_from_w = usable / (nb_choices * (1 + GAP_RATIO))

        box = min(box_from_h, box_from_w, MAX_BOX)
        if box < MIN_BOX:
            continue
        if best is None or box > best["box"]:
            best = dict(box=box, gap=box*GAP_RATIO, n_cols=n_cols,
                        q_per_col=q_per_col, col_sp=col_sp)
    if best is None:
        limit = MAX_Q_REMORSE if has_remorse else MAX_Q_NO_REMORSE
        raise ValueError(f"Impossible de faire tenir {nb_q} questions sur A4. Limite : {limit}.")
    return best


def draw_qcm_grid(c, grid_top, nb_q, nb_choices, has_remorse):
    avail_h = grid_top - MARGIN_Y
    avail_w = W - 2 * MARGIN_X
    letters = "ABCDE"[:nb_choices]

    lay       = _compute_layout(nb_q, nb_choices, has_remorse, avail_h, avail_w)
    box       = lay["box"]
    gap       = lay["gap"]
    n_cols    = lay["n_cols"]
    q_per_col = lay["q_per_col"]
    col_sp    = lay["col_sp"]
    cell_step = box + gap

    if has_remorse:
        q_block_h = box + ROW_GAP + box + Q_GAP
    else:
        q_block_h = box + Q_GAP

    num_font = max(5.0, min(8.0,  box/mm * 0.9))
    let_font = max(4.5, min(7.5,  box/mm * 0.85))
    rem_font = max(3.5, min(5.5,  box/mm * 0.65))

    for col in range(n_cols):
        q_start = col * q_per_col + 1
        q_end   = min(q_start + q_per_col - 1, nb_q)
        if q_start > nb_q:
            break

        base_x = MARGIN_X + col * col_sp
        cur_y  = grid_top

        # Header lettres
        c.setFont("Helvetica-Bold", let_font)
        c.setFillColor(colors.black)
        for i, letter in enumerate(letters):
            lx = base_x + NUM_W + i * cell_step + box/2
            c.drawCentredString(lx, cur_y - 1*mm, letter)
        cur_y -= 3.5 * mm

        for q in range(q_start, q_end + 1):
            in_col = q - q_start

            # Filet léger tous les 5 questions
            if in_col > 0 and in_col % 5 == 0:
                fy = cur_y + Q_GAP * 0.45
                c.setLineWidth(0.25)
                c.setStrokeColor(colors.Color(0.75, 0.75, 0.75))
                c.line(base_x, fy, base_x + NUM_W + nb_choices*cell_step, fy)
                c.setStrokeColor(colors.black)

            c.setFont("Helvetica-Bold", num_font)
            c.setFillColor(colors.black)
            c.drawRightString(base_x + NUM_W - 1.5*mm,
                              cur_y - box/2 - 0.6*mm, str(q))

            for i in range(nb_choices):
                _box(c, base_x + NUM_W + i*cell_step, cur_y, box)

            if has_remorse:
                ry = cur_y - box - ROW_GAP
                c.setFont("Helvetica-Oblique", rem_font)
                c.setFillColor(colors.Color(0.55, 0.55, 0.55))
                c.drawRightString(base_x + NUM_W - 1.5*mm,
                                  ry - box/2 - 0.5*mm, "r")
                c.setFillColor(colors.black)
                for i in range(nb_choices):
                    _box(c, base_x + NUM_W + i*cell_step, ry, box)

            cur_y -= q_block_h


def generate_exam_pdf(output_path, title, institution,
                      nb_questions, nb_choices, has_remorse=True):
    limit = MAX_Q_REMORSE if has_remorse else MAX_Q_NO_REMORSE
    if nb_questions > limit:
        raise ValueError(f"Maximum {limit} questions sur A4.")
    if nb_questions < 1:
        raise ValueError("Il faut au moins 1 question.")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    c = canvas.Canvas(output_path, pagesize=A4)
    c.setTitle(f"{title} — {institution}")
    _crosses(c)
    grid_top = draw_header(c, title, institution)
    draw_qcm_grid(c, grid_top, nb_questions, nb_choices, has_remorse)
    c.save()
    return output_path
