from main import get_stack_info

# Legacy compatibility module retained so imports do not fail after the
# stack migration away from FastAPI.
app = get_stack_info()
