

def recall_at_k(
    retrieved_files: list[str],
    relevant_files: list[str],
    k: int
) -> float:
    if k <= 0 or not relevant_files:
        return 0.0

    excpected_set = set(relevant_files)
    retrieved_set = set(retrieved_files[:k])

    return len(excpected_set & retrieved_set) / len(excpected_set)


def reciprocal_rank(
    retrieved_files: list[str],
    relevant_files: list[str],
    k: int
) -> float:
    if k <= 0 :
        return 0.0

    excpected_set = set(relevant_files)

    for rank, file_path in enumerate(retrieved_files[:k], start=1):
        if file_path in excpected_set:
            return 1.0 / rank

    return 0.0


def mean(
    values: list[float]
) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)